<script module lang="ts">
	import { Cache, type CacheEntry } from '$lib/cache';

	const GET_PROFILES_ACTORS_MAX = 25;

	interface Profile extends CacheEntry {
		avatar: string | undefined;
		displayName: string | undefined;
		handle: string;
	}

	const PROFILE_CACHE_AGE = 5 * 60 * 1000;
	const profileCache = new Cache<Profile>();

	// <https://github.com/bluesky-social/social-app/blob/7574a74/src/view/com/util/UserAvatar.tsx#L615-L623>
	function hackModifyThumbnailPath(uri: string): string {
		return uri.replace('/img/avatar/plain/', '/img/avatar_thumbnail/plain/');
	}

	const client = new AtpBaseClient({
		service: 'https://public.api.bsky.app',
	});
</script>

<script lang="ts">
	import { AtpBaseClient } from '@atproto/api';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';

	import * as bsky from '$lib/bsky.js';
	import { oneshot } from '$lib/channel.js';

	let { blocking, signal, active = $bindable() }: {
		blocking: SvelteSet<string>,
		signal: AbortSignal,
		active: boolean,
	} = $props();

	interface Blocker extends CacheEntry {
		blocking: Set<string>;
	}

	const BLOCKER_CACHE_AGE = 15 * 60 * 1000;
	const blockerCache = new Cache<Blocker>();

	let commonBlockerCountMemo = new Map<string, number>();
	let toBlock: SvelteMap<string, number> = $state(new SvelteMap());

	let task = $state(new Promise(() => {}));

	$effect(() => {
		const abort = new AbortController();
		const localSignal = AbortSignal.any([signal, abort.signal]);
		const promises = [];

		for (const myBlock of blocking) {
			promises.push((async myBlock => {
				localSignal.throwIfAborted();
				for await (const blockers of bsky.getActorsBlocking(myBlock, localSignal)) {
					localSignal.throwIfAborted();
					blockers.map(async blockerDid => {
						localSignal.throwIfAborted();
						commonBlockerCountMemo.set(blockerDid, (commonBlockerCountMemo.get(blockerDid) ?? 0) + 1);
						let blocker = blockerCache.get(blockerDid);
						if (!blocker) {
							const blockerBlocking: Set<string> = new Set();
							blocker = {
								blocking: blockerBlocking,
								expires: Infinity,
							};
							blockerCache.set(blockerDid, blocker);
							try {
								for await (const theirBlocks of bsky.getActorsBlockedBy(blockerDid, localSignal)) {
									localSignal.throwIfAborted();
									for (const theirBlock of theirBlocks) {
										if (!blockerBlocking.has(theirBlock)) {
											if (!blocking.has(theirBlock)) {
												toBlock.set(theirBlock, (toBlock.get(theirBlock) ?? 0) + commonBlockerCountMemo.get(blockerDid)!);
											}
											blockerBlocking.add(theirBlock);
										}
									}
								}
							} catch (e) {
								console.error(e);
							} finally {
								blocker.expires = Date.now() + BLOCKER_CACHE_AGE;
								// Clear the memo so that we won't count already-counted common blocks
								// after a cache eviction.
								commonBlockerCountMemo.delete(blockerDid);
							}
						} else {
							for (const theirBlock of blocker.blocking) {
								if (!blocking.has(theirBlock)) {
									toBlock.set(theirBlock, (toBlock.get(theirBlock) ?? 0) + 1);
								}
							}
							// Another job may add to `blocker.blocking` later, but that's ok because
							// the other job will use the incremented `commonBlockerCountMemo` value.
						}
					});
				}
			})(myBlock));
		}

		task = Promise.allSettled(promises).then(() => { active = false });

		return () => abort.abort();
	});

	let profilesAndTasks = $derived.by(() => {
		const profiles = new Map<string, Profile | Promise<Profile>>();
		const tasks = new Map<string, (x: Profile) => void>();
		for (const did of toBlock.keys()) {
			let profile: Profile | Promise<Profile> | void = profileCache.get(did);
			if (!profile) {
				const { tx, rx } = oneshot<Profile>();
				profile = rx;
				tasks.set(did, tx);
			}
			profiles.set(did, profile);
		}
		return { profiles, tasks };
	});
	const profiles = $derived(profilesAndTasks.profiles);
	const profileFetchTasks = $derived(profilesAndTasks.tasks);

	$effect(() => {
		const abort = new AbortController();
		const signal = abort.signal;
		const iter = profileFetchTasks.keys();
		let actors;

		do {
			actors = Array.from(iter.take(GET_PROFILES_ACTORS_MAX));
			if (actors.length === 0) {
				break;
			}
			client.app.bsky.actor.getProfiles({ actors }, { signal })
				.then(({ data: { profiles } }) => {
					const expires = Date.now() + PROFILE_CACHE_AGE;
					for (const profile of profiles) {
						const entry = {
							avatar: profile.avatar,
							displayName: profile.displayName,
							handle: profile.handle,
							expires,
						};
						profileCache.set(profile.did, entry);
						profileFetchTasks.get(profile.did)?.(entry);
					}
				});
		} while (actors.length === GET_PROFILES_ACTORS_MAX);

		return () => abort.abort();
	});

	let toBlockSorted = $derived.by(() => {
		return toBlock.entries().toArray().sort(([, a], [, b]) => b - a);
	});
</script>

{#snippet fallbackAvatar()}
	<!-- <https://github.com/bluesky-social/social-app/blob/7574a74/src/view/com/util/UserAvatar.tsx#L190-L206> -->
	<svg
		class="avatar"
		role="img"
		aria-label="No avatar"
		viewBox="0 0 24 24"
		fill="none"
		stroke="none">
		<circle cx="12" cy="12" r="12" fill="#0070ff" />
		<circle cx="12" cy="9.5" r="3.5" fill="#fff" />
		<path
			stroke-linecap="round"
			stroke-linejoin="round"
			fill="#fff"
			d="M 12.058 22.784 C 9.422 22.784 7.007 21.836 5.137 20.262 C 5.667 17.988 8.534 16.25 11.99 16.25 C 15.494 16.25 18.391 18.036 18.864 20.357 C 17.01 21.874 14.64 22.784 12.058 22.784 Z"
        />
	</svg>
{/snippet}

<ul>
	{#if toBlockSorted.length}
		{#each toBlockSorted as [did, count] (did)}
			<li><a class="profile-link" href="https://bsky.app/profile/{did}">
				{#await profiles.get(did)!}
					<div class="avatar-container">
						{@render fallbackAvatar()}
					</div>
					<span>
						{did}
						({count})
					</span>
				{:then profile}
					<div class="avatar-container">
						{#if profile.avatar}
							<img
								class="avatar"
								src={hackModifyThumbnailPath(profile.avatar)}
								alt="@{profile.handle}"
								aria-labelledby="{did}-handle"
								loading="lazy" />
						{:else}
							{@render fallbackAvatar()}
						{/if}
					</div>
					<span>
						<span id="{did}-handle">@{profile.handle}</span>
						{#if profile.displayName}
							{profile.displayName}
						{:else}
							{did}
						{/if}
						({count})
					</span>
				{/await}
			</a></li>
		{/each}
	{:else if !active}
		<p>No users to Block!</p>
	{/if}
</ul>

<style>
	li:nth-child(2n) {
		background: #DDD;
	}

	.profile-link {
		display: flex;
		align-items: center;
		margin-block: 4px;
	}

	.avatar-container {
		width: 32px;
		height: 32px;
		margin: 4px;
	}

	.avatar {
		width: 100%;
		max-height: 100%;
		border-radius: 100%;
	}
</style>
