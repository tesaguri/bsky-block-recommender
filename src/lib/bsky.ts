import { AtpBaseClient } from '@atproto/api';
import { DidResolver, getPds, HandleResolver } from '@atproto/identity';
import * as constellation from '$lib/constellation.js';

const handleResolver = new HandleResolver();
const didResolver = new DidResolver({});
export async function* getBlocksOfActor(id: string, signal: AbortSignal): AsyncGenerator<string[]> {
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

	let cursor;
	do {
		const res = await client.com.atproto.repo.listRecords({
			repo: did,
			collection: 'app.bsky.graph.block',
			cursor,
			limit: 100,
		});
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
