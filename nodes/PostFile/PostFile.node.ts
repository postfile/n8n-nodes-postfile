import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	JsonObject,
	NodeApiError,
} from 'n8n-workflow';

const LARGE_UPLOAD_THRESHOLD_BYTES = 100 * 1024 * 1024;

/** Prefix hostname with upload. for large-file uploads (e.g. postfile.net → upload.postfile.net). */
function getUploadBaseUrl(baseUrl: string, fileSizeBytes: number): string {
	if (fileSizeBytes <= LARGE_UPLOAD_THRESHOLD_BYTES) {
		return baseUrl;
	}

	const url = new URL(baseUrl);
	if (!url.hostname.startsWith('upload.')) {
		url.hostname = `upload.${url.hostname}`;
	}
	return url.toString().replace(/\/$/, '');
}

export class PostFile implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'PostFile',
		name: 'postFile',
		icon: {
			light: 'file:postfile.svg',
			dark: 'file:postfile.dark.svg',
		},
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Uploads files and returns public URLs',
		defaults: {
			name: 'PostFile',
		},
		usableAsTool: {
			replacements: {
				displayName: 'PostFile Tool',
				description:
					'Upload files to PostFile, list uploaded files, retrieve file details, or delete files by ID. Use this tool when an AI Agent needs to create or manage public file URLs.',
			},
		},
		inputs: ['main'],
		outputs: ['main'],
		credentials: [
			{
				name: 'postFileApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Delete File',
						value: 'delete',
						description: 'Deletes a file',
						action: 'Delete file',
					},
					{
						name: 'Get File',
						value: 'get',
						description: 'Gets details for a specific file',
						action: 'Get file details',
					},
					{
						name: 'List Files',
						value: 'list',
						description: 'Lists uploaded files',
						action: 'List files',
					},
					{
						name: 'Upload File',
						value: 'upload',
						description: 'Uploads a file and returns a public URL',
						action: 'Upload file',
					},
				],
				default: 'upload',
			},
			// Upload fields
			{
				displayName: 'Input Binary Field',
				name: 'binaryPropertyName',
				type: 'string',
				default: 'data',
				required: true,
				displayOptions: {
					show: {
						operation: ['upload'],
					},
				},
				description: 'Name of the binary property containing the file to upload',
			},
			// Get/Delete fields
			{
				displayName: 'File ID',
				name: 'fileId',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						operation: ['get', 'delete'],
					},
				},
				description: 'The ID of the file',
			},
			// List fields
			{
				displayName: 'Page',
				name: 'page',
				type: 'number',
				default: 1,
				displayOptions: {
					show: {
						operation: ['list'],
					},
				},
				description: 'Page number',
			},
			{
				displayName: 'Per Page',
				name: 'perPage',
				type: 'number',
				default: 50,
				displayOptions: {
					show: {
						operation: ['list'],
					},
				},
				description: 'Number of results per page (max 100)',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const operation = this.getNodeParameter('operation', 0) as string;
		const credentials = await this.getCredentials('postFileApi');
		const baseUrl = (credentials.url as string) || 'https://postfile.net/v1';

		for (let i = 0; i < items.length; i++) {
			try {
				if (operation === 'upload') {
					const binaryPropertyName = this.getNodeParameter('binaryPropertyName', i) as string;
					const binaryData = this.helpers.assertBinaryData(i, binaryPropertyName);
					const buffer = await this.helpers.getBinaryDataBuffer(i, binaryPropertyName);

					let fileName = binaryData.fileName;
					const mimeType = binaryData.mimeType || 'application/octet-stream';
					if (!fileName || !fileName.includes('.')) {
						const ext = mimeType.split('/')[1]?.split(';')[0] || 'bin';
						fileName = `upload.${ext}`;
					}

					const formData = new FormData();
					formData.append('file', new Blob([new Uint8Array(buffer)], { type: mimeType }), fileName);

					const uploadBaseUrl = getUploadBaseUrl(baseUrl, buffer.length);

					const response = await this.helpers.httpRequestWithAuthentication.call(this, 'postFileApi', {
						method: 'POST',
						url: `${uploadBaseUrl}/upload`,
						body: formData,
						json: true,
					});

					returnData.push({ json: response as any, pairedItem: { item: i } });

				} else if (operation === 'list') {
					const page = this.getNodeParameter('page', i) as number;
					const perPage = this.getNodeParameter('perPage', i) as number;

					const response = await this.helpers.httpRequestWithAuthentication.call(this, 'postFileApi', {
						method: 'GET',
						url: `${baseUrl}/files`,
						qs: { page, per_page: perPage },
						json: true,
					});

					returnData.push({ json: response as any, pairedItem: { item: i } });

				} else if (operation === 'get') {
					const fileId = this.getNodeParameter('fileId', i) as string;

					const response = await this.helpers.httpRequestWithAuthentication.call(this, 'postFileApi', {
						method: 'GET',
						url: `${baseUrl}/files/${fileId}`,
						json: true,
					});

					returnData.push({ json: response as any, pairedItem: { item: i } });

				} else if (operation === 'delete') {
					const fileId = this.getNodeParameter('fileId', i) as string;

					const response = await this.helpers.httpRequestWithAuthentication.call(this, 'postFileApi', {
						method: 'DELETE',
						url: `${baseUrl}/files/${fileId}`,
						json: true,
					});

					returnData.push({ json: response as any, pairedItem: { item: i } });
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({ json: { error: (error as Error).message }, pairedItem: { item: i } });
					continue;
				}
				throw new NodeApiError(this.getNode(), error as JsonObject, { itemIndex: i });
			}
		}

		return [returnData];
	}
}
