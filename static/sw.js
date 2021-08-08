importScripts("wasm_exec.js");

let encryption_keys = {};

// Cache disabled during development

/*const CACHE = "バージョン第一";
// How long user-created images are stored (in seconds)
const IMAGE_CACHE_TIME = 2 * 24 * 60 * 60 // Two days
const IMAGE = "写真キャシュだぜ"

self.addEventListener("fetch", event => {
	event.respondWith(respond(event));
});

async function respond(event) {
	//open_database(event);

	// Let cache open in background
	const cache_promise = caches.match(event.request);

	let fetched_response;
	try {
		fetched_response = await fetch(event.request);
	} catch (error) {
		// Try cache if fetching fails
		return cache_promise;
	}

	// Choose if we use the cache or fetched response
	if (!fetched_response || fetched_response.status !== 200) {
		// Fetching status is not OK
		const cache_response = await cache_promise;
		if (cache_response != undefined) {
			return cache_response;
		} else {
			// Return erronious response
			return fetched_response;
		}
	} else {
		// Only cache same-origin requests
		if (fetched_response.type === 'basic' && event.request.method == "GET") {
			// Store user-uploaded images separately

			if (event.request.url.split("/")[3] == "images") {
				const expires = new Date();
				expires.setSeconds(
					expires.getSeconds() + IMAGE_CACHE_TIME
				);
				const cache_response_fields = {
					status: fetched_response.status,
					statusText: fetched_response.status,
					headers: { "SW-Cache-Expires": expires.toUTCString() }
				};
				fetched_response.headers.forEach((value, key) => {
					cache_response_fields.headers[key] = value;
				});
			}
			// Cache and respond with fetched response
			let response_to_be_cached = fetched_response.clone();
			let opened = await caches.open(CACHE)
			opened.put(event.request, response_to_be_cached);
		}
		return fetched_response;
	}
}

function precache() {
	caches.open(CACHE).then(cache =>
		cache.addAll([
			"cabin.css",
			"main.css",
			"room.css",
			"main.js",
			"imgs/arrow32.png",
			"imgs/x.png",
			"imgs/usekta.png",
			"imgs/ank.gif",
		]));
}*/

self.addEventListener("install", event => {
	const go = new Go();
	WebAssembly.instantiateStreaming(fetch("encryption.wasm"), go.importObject).then(result => {
		go.run(result.instance);
	});

	// Cache disabled during development
	//event.waitUntil(precache());
});

self.addEventListener("message", message => {
	const data = message.data;

	console.log(message);
	console.log(data.subject)

	console.log(data.subject === "E2EEK")
	if (data.subject === "E2EEK") {
		encryption_keys[data.name] = data.value;
	}
});

self.addEventListener('push', event => {
	event.waitUntil(handlePush(event));
});

async function handlePush(event) {
	const data = JSON.parse(event.data.text())

	// Check if a window is already focused
	// So that we only send notifications when in background
	const all_clients = await clients.matchAll({
		includeUncontrolled: true
	});

	for (const client of all_clients) {
		if (client.visibilityState === 'visible') {
			// Open window found, do not display a notification
			return
		}
	}

	const actions = data.Action == "fren" ?
		// Friend request
		[{ action: "open", title: "Open requests" }]
		// Chat message
		: [{ action: 'open', title: 'Open chat' },
		{ action: 'mute', title: 'Mute' }]


	let text = data.Text;
	
	// Try to decrypt
	if (data.Action != "fren") {
		const group_id = data.Action;
		const key = encryption_keys["E2EEK" + group_id];
		if (key) {
			const res = generate_block_from_key(key);
			if (res[0] === "1") {
				const dec = decrypt_message(text);
				if (dec[0] === "1") {
					text = dec.slice(1);
				}
			}
		}
	}

	const options = {
		body: text,
		actions: actions,
		data: data
	};

	return self.registration.showNotification(data.Title, options);
}

self.addEventListener('notificationclick', event => {
	const data = event.notification.data;
	event.notification.close();

	if (event.action === 'mute') {
		// TODO mute
		console.log("Not implemented");
	} else {
		// If the user clicked on open or notification body
		const url = data.Action == "fren" ?
			// Friend requst
			`/?fren_requests`
			// Chat message
			: `/?group_id=${data.Action}`;
		event.waitUntil(clients.matchAll({ type: 'window' }).then(clients_arr => {
			let window_exists = false;
			for (const client of clients_arr) {
				if (client.url.includes(url)) {
					client.focus();
					window_exists = true;
				}
			}
			if (!window_exists) {
				clients.openWindow(url);
			}
		}));
	}
}, false);

self.addEventListener('pushsubscriptionchange', event => {
	event.waitUntil(swRegistration.pushManager.subscribe(event.oldSubscription.options)
		.then(subscription => {
			return fetch("/updatepush", {
				method: "POST",
				headers: {
					"Content-type": "application/json"
				},
				body: JSON.stringify({
					old_endpoint: event.oldSubscription ? event.oldSubscription.endpoint : null,
					new_subscription: subscription.toJSON(),
				})
			})
		})
	);
});
