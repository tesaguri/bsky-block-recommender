import pLimit from 'p-limit';

const requestLimit = pLimit(5);

export type DistinctDidsParams = {
	target: string;
	collection: string;
	path: string;
	cursor?: string;
};

export type DistinctDidsResponse = {
	total: number;
	linking_dids: string[];
	cursor?: string | null;
};

export async function distinctDids(params: DistinctDidsParams, signal: AbortSignal): Promise<DistinctDidsResponse> {
	if (params.cursor === undefined && 'cursor' in params) {
		delete params.cursor;
	}
	const search = new URLSearchParams(params).toString();
	const res = await requestLimit(
		fetch,
		'https://constellation.microcosm.blue/links/distinct-dids?' + search,
		{
			headers: new Headers({ accept: 'appliccation/json' }),
			signal,
		},
	);
	if (!res.ok) {
		throw Error(`Got HTTP ${res.status} error during Constellation request: ${search}`);
	}
	return res.json();
}
