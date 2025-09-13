<script lang="ts">
	import { isAtprotoDid } from '@atproto/did';
	import { isValidHandle } from '@atproto/syntax';

	import BskyActorList from '$lib/components/BskyActorList.svelte';
	import * as bsky from '$lib/bsky.js';

	let actor = $state('');
	let actorIsValid = $derived(isValidHandle(actor) || isAtprotoDid(actor));
	let blockingInput = $state('');
	let toBlock: string[] | undefined = $state();

	let loadBlocksPromise = $state();
	let loadBlocksAbort: AbortController | undefined;
	function loadBlocks() {
		const abort = new AbortController();
		const signal = abort.signal;
		loadBlocksPromise = (async () => {
			for await (const subjects of bsky.getBlocksOfActor(actor, signal)) {
				blockingInput += subjects.join('\n');
				blockingInput += '\n';
			}
		})();
		loadBlocksAbort?.abort();
		loadBlocksAbort = abort;
	}

	function cancelLoadBlocks() {
		loadBlocksAbort?.abort();
		loadBlocksPromise = undefined;
	}

	let makeRecommendationPromise = $state();
	function makeRecommendation() {
		const blocking = new Set(blockingInput.split('\n'));
		blocking.delete('');
		toBlock = [];
		makeRecommendationPromise = (async () => {
			// TODO
			toBlock.push('did:plc:ewvi7nxzyoun6zhxrhs64oiz');
			await new Promise<void>(resolve => setTimeout(resolve, 500));
			toBlock.push('did:plc:z72i7hdynmk6r22z27h6tvur');
		})();
	}

	function cancelMakeRecommendation() {
		makeRecommendationPromise = undefined;
	}
</script>

<form onsubmit={loadBlocks}>
	{#snippet actorInput()}
		<label>Load blocks from account: <input bind:value={actor} /></label>
	{/snippet}
	{#await loadBlocksPromise}
		<div>
			{@render actorInput()}
			<button type="submit" disabled>Loading</button>
			<button onclick={cancelLoadBlocks}>Cancel</button>
		</div>
	{:then}
		<div>
			{@render actorInput()}
			<button type="submit" disabled={!actorIsValid}>Load</button>
			<button disabled>Cancel</button>
		</div>
	{:catch err}
		<div>
			{@render actorInput()}
			<button type="submit" disabled={!actorIsValid}>Load</button>
			<button disabled>Cancel</button>
		</div>
		{#if !(err instanceof DOMException && err.name === 'AbortError')}
			<span class="error" role="alert">Failed to load blocks due to <code>{err.name}</code>: {err.message}</span>
		{/if}
	{/await}
</form>
<h2 id="blocking-heading">Accounts you are blocking</h2>
<form onsubmit={makeRecommendation}>
	<textarea class="blocking" aria-labelledby="blocking-heading" bind:value={blockingInput}></textarea>
	{#await makeRecommendationPromise}
		<button type="submit" disabled>Show me who to block!</button>
		<button onclick={cancelMakeRecommendation}>Cancel</button>
	{:then}
		<button type="submit">Show me who to block!</button>
		<button disabled>Cancel</button>
	{/await}
</form>
{#if toBlock}
	<h2>Result</h2>
	{#if toBlock.length}
		<BskyActorList dids={toBlock}/>
	{:else}
		<p>No users to block!</p>
	{/if}
{/if}

<style>
	.error {
		color: red;
	}

	.blocking {
		display: block;
		width: 270px;
		height: 600px;
		font-family: monospace;
	}
</style>
