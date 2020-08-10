let room_name = undefined;
let user_name = undefined;
let history = [];
let history_index = 0;
let last_message_time = 1337;

const commands = [
	{ name: "help", func: help, arg: "none", info: "Displays a list of commands.", extended: "Type /help command to get in depth info about a command." },
	{ name: "img", func: img, arg: "none", info: "Send an image.", extended: "Click on the box that appears to upload your image." },
	{ name: "goto", func: goto, arg: "string", info: "Jump to a different room.", extended: "Type /goto room to go to a room called \"room\" and keep you username." },
	{ name: "name", func: name, arg: "string", info: "Change your name.", extended: "Type /name bengan to change your name to bengan." },
	{ name: "bg", func: bg, arg: "number", info: "Changes the background-image.", extended: "Type /bg 1 to set the background to background image 1. Type /bg 0 to disable. /bg for a random background. There are 8 different pictures." },
	{ name: "kao", func: kao, arg: "number", info: "Smileys", extended: "There's only one at the moment." },
	{ name: "say", func: say, arg: "string", info: "Speak your mind.", extended: "Type /say /say to say /say." },
	{ name: "dance", func: dance, arg: "number", info: "Use this to dance.", extended: "Type for example /dance 3 for dance number three or /dance for a radnom dance. There are 8 different dances." },
	{ name: "beer", func: beer, arg: "none", info: "Use this to beer.", extended: "Beer! Very unhealthy." },
	{ name: "1337", func: elit, arg: "none", info: "Eliiiiiiiit", extended: "Fett kool elit låda liksom." },
];

(function main() {
	set_background();
	const values = query_string_values();
	room_name = values[0];
	user_name = values[1];
	setTimeout(zoom_in_title, 200);
	get_messages();
	set_send_message_handlers();
	set_scroll_handler();
	setTimeout(register_service_worker, 1000);
})();

async function register_service_worker() {
	if ("serviceWorker" in navigator) {
		navigator.serviceWorker.register("sw.js");

		// TODO subscribe when user types /subscribe and clicks button
		// also TODO remove async from this function
		const response = await get("vapid")
		const serverKey = await response.text()

		// TODO simplify below
		navigator.serviceWorker.ready.then(registration => {
			registration.pushManager.getSubscription().then(subscription => {
				const json = subscription.toJSON();
				fetch(`subscribe/${room_name}/${user_name}`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify(json)
				});
			}).catch(e => {
				// Subscribe
				const options = {
					userVisibleOnly: true,
					applicationServerKey: serverKey
				};
				registration.pushManager.subscribe(options).then(subscription => {
					fetch(`subscribe/${room_name}/${user_name}`, {
						method: 'POST',
						headers: {
							'Content-Type': 'application/json'
						},
						body: JSON.stringify(subscription.toJSON())
					});
				}, error => {
					console.log(error);
				})
			});
		});
	}
}

function set_background() {
	const main = document.querySelector("main");
	const number = localStorage.getItem("bg");
	if (number && parseInt(number) !== Math.NaN && number !== "0") {
		main.style.backgroundImage = `url(backgrounds/bg${parseInt(number)}.jpg)`;
	}
}

function get_messages() {
	get("messages").then(response => {
		if (response.ok) {
			response.text().then(messages => {
				const list = base64_to_json(messages);
				for (const message of list) {
					display_message(message);
				}
				await_messages();
				const container = document.getElementById("messages");
				setTimeout(() => {
					container.scrollTop = container.scrollHeight;
				}, 500);
			});
		}
	});
}

function display_message(message) {
	last_message_time = 1 + new Date(message.TimeStamp).getTime();

	// Decode message object
	message.Text = escape(message.Text);
	message.AttachmentPath = escape(message.AttachmentPath);
	for (const field of ["SenderName", "Text", "AttachmentPath"]) {
		message[field] = decodeURIComponent(message[field]);
	}

	// Build message element
	const container = document.createElement("div");
	container.classList.add("message-container");
	const element = document.createElement("div");
	element.classList.add("message");
	container.appendChild(element);

	// Name tag
	const name_tag = document.createElement("span");
	name_tag.style.color = `hsl(${Math.abs(unsecure_string_hash(message.SenderName)) % 256}, 100%, 70%)`;
	name_tag.innerText = message.SenderName + ": ";
	name_tag.classList.add("name-tag");
	element.appendChild(name_tag);

	// Message text
	const text = document.createElement("span");
	text.innerText = message.Text;
	element.appendChild(text);

	// Insert attachment if there is one
	if (message.AttachmentPath != "") {
		const img = document.createElement("img");
		img.src = message.AttachmentPath;
		element.appendChild(img);
	}

	insert_message(container);
}

function insert_message(message) {
	const messages = document.getElementById("messages");
	const at_bottom = messages.scrollHeight - messages.clientHeight - messages.scrollTop <= 2;
	messages.append(message);

	// Scroll view to the new message if already scrolled down max
	if (at_bottom) {
		const images = message.getElementsByTagName("img");
		if (images.length > 0) {
			for (const image of images) {
				image.addEventListener("load", () => {
					requestAnimationFrame(() => {
						messages.scrollTop = messages.scrollHeight;
					});
				});
			}
		}

		requestAnimationFrame(() => {
			messages.scrollTop = messages.scrollHeight;
		});
	}
}

function get(path, data) {
	let location = `${path}/${room_name}/${user_name}`;
	if (data)
		location += "/" + data;
	return fetch(location);
}

function query_string_values() {
	return window.location.search.substring(1).split("&").map(mapping =>
		mapping.split("=")[1]);
}

function zoom_in_title() {
	// Startup animation
	const title = document.getElementById("welcome");
	title.innerText = `Welcome, ${decodeURIComponent(user_name)}`
	requestAnimationFrame(() => title.classList.add("enter"));
	setTimeout(() => {
		requestAnimationFrame(() => {
			const main = document.querySelector("main");
			main.classList.add("zoom-in");
			title.classList.add("zoom-out")
		});
		setTimeout(() => {
			title.remove();
		}, 400);
	}, 600);
}

function arrow_controller() {
	const input = document.getElementById("msg_input");
	const arrow = document.getElementById("arrow");

	input.value = trim_enters(input.value);

	if (input.value == "") {
		arrow.classList.remove("active");
	} else {
		arrow.classList.add("active");
	}
}

function trim_enters(string) {
	if (string[0] === "\n") {
		string = string.substr(1);
	}
	if (string[string.length - 1] === "\n") {
		string = string.slice(0, -1);
	}
	return string;
}

function set_send_message_handlers() {
	const arrow = document.getElementById("arrow");
	const input = document.getElementById("msg_input");
	arrow.addEventListener("click", event => {
		if (arrow.classList.contains("active")) {
			const text = input.value;
			send_message(text);
		}
	});
	input.addEventListener("keydown", input_keydown);
}

function input_keydown(event) {
	const input = document.getElementById("msg_input");
	if (!event.shiftKey && event.code == "Enter") {
		if (autocompleter_is_up()) {
			insert_selected_command();
		} else {
			// Remove enter from the end of value
			requestAnimationFrame(() => {
				input.value = trim_enters(input.value);
				if (input.textLength > 0) {
					send_message(input.value);
				}
			});
		}
	} else if (event.code === "ArrowUp") {
		if (autocompleter_is_up()) {
			set_autocomplete_position("up");
		} else {
			if (history[history_index] !== undefined) {
				input.value = history[history_index];
				history_index--;
			}
		}
	} else if (event.code === "ArrowDown") {
		if (autocompleter_is_up()) {
			set_autocomplete_position("down");
		} else {
			if (history[history_index + 1] !== undefined) {
				history_index++;
				input.value = history[history_index];
			}
		}
	} else {
		requestAnimationFrame(() => {
			update_autocompleter(input.value);
		})
	}

	requestAnimationFrame(arrow_controller);
}

function set_autocomplete_position(change) {
	const autocompleter = document.getElementById("autocompleter");
	const children = autocompleter.children
	let selected = autocompleter.querySelector(".selected");
	selected.classList.remove("selected");
	if (change == "up") {
		const next = selected.previousSibling;
		if (next == null)
			selected = children[children.length - 1];
		else
			selected = next;
	} else if (change == "down") {
		const next = selected.nextSibling;
		if (next == null)
			selected = children[0];
		else
			selected = next;
	}
	selected.classList.add("selected");
}

function update_autocompleter(value) {
	if (value[0] == "/" && !value.includes(" ")) {
		autocomplete(value.substr(1));
	} else {
		hide_autocompleter();
	}
}

function autocompleter_is_up() {
	return document.getElementById("autocompleter").classList.contains("displayed");
}

function hide_autocompleter() {
	const autocompleter = document.getElementById("autocompleter");
	autocompleter.innerText = "";
	autocompleter.classList.remove("displayed");
}

function autocomplete(text) {
	const autocompleter = document.getElementById("autocompleter");
	const parent = autocompleter.parentNode;
	const height = parent.clientHeight;
	autocompleter.style.bottom = (height - 8) + "px";
	const matches = [];
	for (const command of commands) {
		for (const value of ["name", "info"]) {
			if (command[value].toLowerCase().includes(text)) {
				matches.push(command);
				break;
			}
		}
	}

	if (matches.length > 0)
		autocompleter.classList.add("displayed");
	else
		autocompleter.classList.remove("displayed");

	let html = "";
	matches.forEach((cmd, index) => {
		const color = `hsl(${2 + index * 4}, 83%, 66%)`;
		html += `<div class="suggestion" onclick="chose_suggestion('${cmd.name}')">
			<span style="color: ${color}">${cmd.name}</span> - ${cmd.info}
		</div>`
	});

	autocompleter.innerHTML = html;

	requestAnimationFrame(() => {
		const children = autocompleter.children;
		if (children.length > 0)
			children[0].classList.add("selected");
	});
}

function chose_suggestion(name) {
	const input = document.getElementById("msg_input");
	input.value = `/${name} `;
	input.focus();
	requestAnimationFrame(() => update_autocompleter(input.value));
}

function insert_selected_command() {
	const select = document.querySelector("#autocompleter .selected");
	select.onclick();
	requestAnimationFrame(() => {
		const input = document.getElementById("msg_input");
		update_autocompleter(input.value);
	})
}

function set_scroll_handler() {
	const messages = document.getElementById("messages");
	messages.addEventListener("scroll", () => {
		user_scrolled = true;
	});
}

function send_message(text, check_command = true) {
	hide_autocompleter();

	text = trim_enters(text);

	// Store in history
	if (history[history.length - 1] != text) {
		history.push(text);
	}
	history_index = history.length - 1;

	// Empty field
	const input = document.getElementById("msg_input");
	input.value = "";

	// Disable send button
	const arrow = document.getElementById("arrow");
	arrow.classList.remove("active");

	// Run command instead of sending message if text starts with "/"
	if (check_command && text.startsWith("/")) {
		run_command(text);
		return;
	}

	// Send message
	post_message_object({
		SenderName: user_name,
		Text: text,
		AttachmentPath: "",
		TimeStamp: undefined
	}, room_name);
}

function post_message_object(message, room) {
	fetch("sendmessage/" + room, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify(message)
	});
}

function run_command(text) {
	// Remove "/" from beginning
	text = text.substr(1);
	let words = text.split(" ");
	command_name = words[0];
	const command = find_command(command_name);
	if (!command) {
		display_command_message(`Command "${command_name}" could not be found`);
	} else {
		words.shift()
		words = words.join(" ");
		const type = command.arg;
		if (matches_type(type, words)) {
			command.func(words);
		} else {
			display_command_message("You have to specify a parameter of type " + type);
		}
	}
}

function matches_type(type, value) {
	if (type === "none")
		return true;
	if (value === "")
		return type === "none" || type === "number";
	else if (type === "number") {
		return parseInt(value) !== Math.NaN;
	} else if (type === "string") {
		return typeof (value) === "string" && value.length > 0;
	} else {
		return false;
	}
}

function await_messages() {
	// This works
	get("awaitmessages", last_message_time).then(response => {
		if (!response.ok) {
			response.text().then(body => {
				if (body == "Timeout") {
					await_messages();
				} else {
					disconnected("Unknown error");
				}
			}).catch(error => {
				disconnected(error);
			});
		} else {
			response.text().then(text => {
				const list = base64_to_json(text);
				for (const message of list) {
					display_message(message);
				}
				await_messages();
			});
		}
	}).catch(error => {
		disconnected("Failed to connect");
	});
}

function disconnected(reason) {
	display_dialog(`<div class="center-content">
			<h3>You have been disconnected</h3>
			<h4>${reason}</h4>
		</div>
		<div class="button" style="margin-top: 12px" onclick="reconnect()">Reconnect</div>`);
}

function reconnect() {
	hide_all_dialogs();
	await_messages();
}

function unsecure_string_hash(string) {
	let hash = 0;
	let i;
	let char;
	for (i = 0; i < string.length; i++) {
		char = string.charCodeAt(i);
		hash = ((hash << 5) - hash) + char;
		hash |= 0;
	}
	return hash;
}

function base64_to_json(string) {
	return JSON.parse(atob(string.split("\"").join("")));
}

function find_command(name) {
	for (const command of commands) {
		if (command.name == name) {
			return command;
		}
	}
	return undefined;
}

function display_command_message(message) {
	// Build message element
	const container = document.createElement("div");
	container.classList.add("message-container");
	const element = document.createElement("div");
	element.classList.add("message");
	container.appendChild(element);

	// Message text
	element.innerHTML = message;

	insert_message(container);
}

function send_attachment(path) {
	post_message_object({
		SenderName: user_name,
		Text: "",
		AttachmentPath: path,
		TimeStamp: undefined
	}, room_name);
}

function display_dialog(content) {
	const dialog = document.createElement("div");
	dialog.classList.add("dialog");
	dialog.innerHTML = content;

	const exit_button = document.createElement("img");
	exit_button.setAttribute("class", "clickable exit-button");
	exit_button.src = "imgs/x.png";
	exit_button.addEventListener("click", hide_all_dialogs);
	dialog.appendChild(exit_button);

	document.body.appendChild(dialog);
	requestAnimationFrame(() => {
		dialog.classList.add("displayed");
	});
}

function hide_all_dialogs() {
	const dialogs = document.getElementsByClassName("dialog");
	for (const dialog of dialogs) {
		dialog.classList.remove("displayed");
		setTimeout(() => {
			dialog.remove()
		}, 200);
	}
}

function upload_file(input) {
	const file = input.files[0];
	const name = file.name;
	file.arrayBuffer().then(buffer => {
		fetch(`/uploadfile/${room_name}/${name}`, {
			method: 'POST',
			body: buffer
		}).then(response => {
			response.text().then(filepath => {
				post_message_object({
					SenderName: user_name,
					Text: "",
					AttachmentPath: filepath,
					TimeStamp: undefined
				}, room_name);
			});

			remove_message(input.parentNode);
		}).catch(e => display_dialog(e));
	});
}

function remove_message(message) {
	const container = message.parentNode;
	container.classList.add("remove");
	setTimeout(() => container.remove(), 200);
}


/* ===================== Begin commands ===================== */

function help(arg) {
	let text = "";
	if (arg.length > 0) {
		command_name = arg;
		const command = find_command(command_name);
		if (command) {
			text = `<h4>${command.name}: ${command.info}</h4>${command.extended}`;
		} else {
			text = "Could not find command " + command_name;
		}
	} else {
		text += "<table><tbody>"
		for (const command of commands) {
			text += `<tr onclick="chose_suggestion('${command.name}')">
				<th>${command.name}</th>
				<th>${command.info}</th>
			</tr>`;
		}
	}
	display_command_message(text);
}

function img() {
	// Need a random id because there can be multiple of these at the same time
	const seed = Math.random() * 1337 * 9001 * 0xBEEF;
	const html = `<div>Upload an image</div>
	<label for="pic${seed}">
		<img class="clickable" src="imgs/uploadfile.svg"/>
	</label>
	<input id="pic${seed}" type="file" onchange="upload_file(this)" accept="image/*">
	<div class="button flat" onclick="remove_message(this.parentNode)">Cancel</div>`
	display_command_message(html);
}

function dance(number) {
	if (number == "") {
		number = Math.floor(Math.random() * 8) + 1;
		localStorage.setItem("bg", number);
		send_attachment(`dances/dance${number}.gif`);
	} else if (number && number == "0" || parseInt(number) === Math.NaN || 0 > parseInt(number) || 8 < parseInt(number)) {
		display_command_message(`There is no dance with the number ${number}.`)
	} else {
		send_attachment(`dances/dance${number}.gif`);
	}
}

function bg(number) {
	const main = document.querySelector("main");
	if (number == "") {
		number = Math.floor(Math.random() * 8) + 1;
		localStorage.setItem("bg", number);
		main.style.backgroundImage = `url(backgrounds/bg${number}.jpg)`;
		display_command_message(`Set background image to bg${number}.jpg`);
	} else if (number == "0"
		|| parseInt(number) === parseInt("") // Check for NaN
		|| 0 > parseInt(number) || 8 < parseInt(number)) {
		localStorage.setItem("bg", 0);
		main.style.backgroundImage = "transparent";
		display_command_message("Removed background image");
	} else {
		localStorage.setItem("bg", number);
		main.style.backgroundImage = `url(backgrounds/bg${parseInt(number)}.jpg)`;
		display_command_message(`Set background image to bg${parseInt(number)}.jpg`);
	}
}

function goto(room) {
	window.location = `/room.html?room=${room}&name=${user_name}`;
}

function name(new_name) {
	window.location = `/room.html?room=${room_name}&name=${new_name}`;
}

function beer() {
	send_attachment("imgs/beer.jfif");
}

function elit() {
	display_command_message(`<marquee style="width: fit-content"><h4>ÅÅÅÅH KLOCKAN ÄR TRETTONTRETTIOSJUU ELIIIIIIT</h4></marquee>
		<br>
		Only you can see this LOLE`);
}

function say(text) {
	send_message(text, false);
}

function kao(number) {
	send_message("▼・ᴥ・▼");
}

/* ===================== End of commands ===================== */