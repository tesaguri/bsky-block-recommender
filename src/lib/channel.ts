export function oneshot<T>(): { tx: (value: T) => void, rx: Promise<T> } {
	let tx;
	const rx = new Promise<T>(resolve => {
		tx = resolve;
	});
	return {
		tx: tx as NonNullable<typeof tx>,
		rx,
	};
}

export type ChannelMsg<T> = {
	value: T,
	next: Promise<ChannelMsg<T>>,
} | { value: undefined, next: undefined };

export function channel<T>(): { tx: (value?: T) => void, rx: Promise<ChannelMsg<T>> } {
	const init = oneshot<ChannelMsg<T>>();
	let tx_ = init.tx;
	return {
		tx: function tx(value) {
			if (arguments.length && value) {
				const next = oneshot<ChannelMsg<T>>();
				tx_({ value, next: next.rx });
				tx_ = next.tx;
			} else {
				tx_({ value: undefined, next: undefined });
			}
		},
		rx: init.rx,
	};
}
