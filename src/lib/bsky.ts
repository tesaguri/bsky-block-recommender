import { AtpBaseClient } from '@atproto/api';
import { MINUTE } from '@atproto/common-web';
import { DidResolver, getPds, HandleResolver, MemoryCache } from '@atproto/identity';
import pLimit from 'p-limit';

import * as constellation from '$lib/constellation.js';

const requestLimit = new Map<string, ReturnType<typeof pLimit>>();

const handleResolver = new HandleResolver();
const didResolver = new DidResolver({ didCache: new MemoryCache(15 * MINUTE, 60 * MINUTE) });
export async function* getActorsBlockedBy(id: string, signal: AbortSignal): AsyncGenerator<string[]> {
	signal.throwIfAborted();

	let did;
	if (id.startsWith('did:')) {
		did = id;
	} else {
		did = await handleResolver.resolve(id);
		signal.throwIfAborted();
		if (!did) {
			throw new Error('Failed to resolve the handle');
		}
	}

	const didDoc = await didResolver.resolve(did);
	signal.throwIfAborted();
	if (!didDoc) {
		throw new Error(`Failed to resolve DID ${did}`);
	}

	const pds = getPds(didDoc);
	if (!pds) {
		throw new Error(`The DID ${did} doesn't have Atproto PDS endpoint`);
	}

	const client = new AtpBaseClient({
		service: pds,
	});

	let limit = requestLimit.get(pds);
	if (!limit) {
		limit = pLimit(5);
		requestLimit.set(pds, limit);
	}

	let cursor: string | undefined;
	do {
		const res = await limit(() => client.com.atproto.repo.listRecords({
			repo: did,
			collection: 'app.bsky.graph.block',
			cursor,
			limit: 100,
		}));
		signal.throwIfAborted();

		yield res.data.records.reduce((acc: string[], record) => {
			if (typeof record.value.subject === 'string') {
				acc.push(record.value.subject);
			}
			return acc;
		}, []);

		cursor = res.data.cursor;
	} while (cursor);
}

export async function* getActorsBlocking(subject: string, signal: AbortSignal): AsyncGenerator<string[]> {
	let cursor;
	do {
		const res = await constellation.distinctDids({
			target: subject,
			collection: 'app.bsky.graph.block',
			path: '.subject',
			cursor,
		}, signal);
		yield res.linking_dids;
		cursor = res.cursor;
	} while (cursor);
}
