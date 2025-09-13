<script module lang="ts">
	const CACHE_AGE = 60 * 1000;
	const GET_PROFILES_ACTORS_MAX = 25;

	interface CacheEntry {
		avatar: string | undefined;
		displayName: string | undefined;
		handle: string;
		expires: number;
	}

	const cache = new Map<string, WeakRef<CacheEntry>>();
	function getCachedProfile(did: string): CacheEntry | void {
		const ref = cache.get(did);
		if (ref) {
			const entry = ref.deref();
			if (entry && Date.now() < entry.expires) {
				return entry;
			} else {
				cache.delete(did);
			}
		}
	}

	function channel<T>(): [(x: T) => void, Promise<T>] {
		let tx;
		const rx = new Promise<T>(resolve => {
			tx = resolve;
		});
		return [tx as NonNullable<typeof tx>, rx];
	}

	// <https://github.com/bluesky-social/social-app/blob/7574a74/src/view/com/util/UserAvatar.tsx#L615-L623>
	function hackModifyThumbnailPath(uri: string): string {
		return uri.replace('/img/avatar/plain/', '/img/avatar_thumbnail/plain/');
	}

	const client = new AtpBaseClient({
		service: 'https://public.api.bsky.app',
	});
</script>


<script lang="ts">
	import { AtpBaseClient } from "@atproto/api";

	let { dids }: { dids: string[] } = $props();

	let profilesAndTasks = $derived(new Set(dids).values().reduce((tuple, did) => {
		const [profiles, tasks] = tuple;
		let profile: CacheEntry | Promise<CacheEntry> | void = getCachedProfile(did);
		if (!profile) {
			const [tx, rx] = channel<CacheEntry>();
			profile = rx;
			tasks.set(did, tx);
		}
		profiles.set(did, profile);
		return tuple;
	}, [new Map<string, CacheEntry | Promise<CacheEntry>>(), new Map<string, (x: CacheEntry) => void>()] as const));
	const profiles = $derived(profilesAndTasks[0]);
	const tasks = $derived(profilesAndTasks[1]);

	$effect(() => {
		const abort = new AbortController();
		const signal = abort.signal;
		const iter = tasks.keys();
		let actors;

		do {
			actors = Array.from(iter.take(GET_PROFILES_ACTORS_MAX));
			if (actors.length === 0) {
				break;
			}
			client.app.bsky.actor.getProfiles({ actors }, { signal })
				.then(({ data: { profiles } }) => {
					const expires = Date.now() + CACHE_AGE;
					for (const profile of profiles) {
						const entry = {
							avatar: profile.avatar,
							displayName: profile.displayName,
							handle: profile.handle,
							expires,
						};
						cache.set(profile.did, new WeakRef(entry));
						tasks.get(profile.did)?.(entry);
					}
				});
		} while (actors.length === GET_PROFILES_ACTORS_MAX);

		return () => abort.abort();
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
	{#each profiles as [did, profile]}
		<li><a class="profile-link" href="https://bsky.app/profile/{did}">
			{#await profile}
				<div class="avatar-container">
					{@render fallbackAvatar()}
				</div>
				{did}
			{:then profile}
				<div class="avatar-container">
					{#if profile.avatar}
						<img
							class="avatar"
							src={hackModifyThumbnailPath(profile.avatar)}
							alt="@{profile.handle}"
							aria-labelledby="{did}-handle" />
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
				</span>
			{/await}
		</a></li>
	{/each}
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
