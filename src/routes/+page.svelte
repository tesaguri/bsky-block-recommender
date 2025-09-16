<script lang="ts">
	import { isAtprotoDid } from '@atproto/did';
	import { isValidHandle } from '@atproto/syntax';
	import { SvelteSet } from 'svelte/reactivity';

	import RecommendationList from '$lib/components/RecommendationList.svelte';
	import * as bsky from '$lib/bsky.js';

	let actor = $state('');
	let actorIsValid = $derived(isValidHandle(actor) || isAtprotoDid(actor));
	let blockingInput = $state('');

	let loadBlocksPromise = $state();
	let loadBlocksAbort: AbortController | undefined;
	function loadBlocks() {
		const abort = new AbortController();
		const signal = abort.signal;
		loadBlocksPromise = (async () => {
			for await (const subjects of bsky.getActorsBlockedBy(actor, signal)) {
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

	interface RecommendationTask {
		blocking: SvelteSet<string>;
		abort: AbortController;
		active: boolean;
	}

	let recommendationTask: RecommendationTask | undefined = $state();
	function makeRecommendation() {
		if (recommendationTask) {
			recommendationTask.abort.abort();
		}
		const blocking = new SvelteSet(blockingInput.split('\n'));
		blocking.delete('');
		recommendationTask = {
			blocking,
			abort: new AbortController(),
			active: true,
		};
	}

	function cancelMakeRecommendation() {
		if (recommendationTask) {
			recommendationTask.abort.abort();
			recommendationTask.active = false;
		}
	}
</script>

<form onsubmit={loadBlocks}>
	{#snippet actorInput()}
		<label>Load blocks from account: <input placeholder="handle.example or did:web:example.com" bind:value={actor} /></label>
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
	<textarea class="blocking" aria-labelledby="blocking-heading" placeholder="did:web:example.com" bind:value={blockingInput}></textarea>
	<button type="submit" disabled={recommendationTask?.active}>Show me who to block!</button>
	<button onclick={cancelMakeRecommendation} disabled={!recommendationTask?.active}>Cancel</button>
</form>
{#if recommendationTask}
	<h2>Result</h2>
	<RecommendationList blocking={recommendationTask.blocking} signal={recommendationTask.abort.signal} bind:active={recommendationTask.active} />
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
