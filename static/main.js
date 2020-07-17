let room_name = undefined;
let user_name = undefined;
let history = [];
let history_index = 0;

const commands = [
	{ name: "help", func: help, arg: "string", info: "Displays a list of commands.", extended: "Type /help command to get in depth info about a command." },
	{ name: "img", func: img, arg: "none", info: "Send an image.", extended: "Click on the box that appears to upload your image." },
	{ name: "dance", func: dance, arg: "none", info: "Use this to dance.", extended: "ÅÅÅh" },
	{ name: "beer", func: beer, arg: "none", info: "Use this to beer.", extended: "Beer!" },
	{ name: "bg", func: bg, arg: "number", info: "Changes the background-image.", extended: "Type /bg 1 to set the background to background image 1. Type /bg 0 to disable. There are 8 different pictures." },
	{ name: "goto", func: goto, arg: "string", info: "Jump to a different room.", extended: "Type /goto room to go to a room called \"room\" and keep you username." },
	{ name: "setname", func: setname, arg: "string", info: "Change your name.", extended: "Type /setname bengan to change your name to bengan." },
];

(function main() {
	const values = query_string_values();
	room_name = values[0];
	user_name = values[1];
	setTimeout(zoom_in_title, 200);
	get_messages();
	await_messages();
	set_send_message_handlers();
})();

function get_messages() {
	get("messages").then(response => {
		if (response.ok) {
			response.text().then(messages => {
				const list = base64_to_json(messages);
				for (const message of list) {
					display_message(message);
				}
				const container = document.getElementById("messages");
				setTimeout(() => {
					container.scrollTop = container.scrollHeight;
				}, 500);
			});
		}
	});
}

function display_message(message) {
	// Build message element
	const container = document.createElement("div");
	container.classList.add("message-container");
	const element = document.createElement("div");
	element.classList.add("message");
	container.appendChild(element);

	/*for (const property of ["SenderName", "Text"])
		message[property] = decodeURIComponent(message[property]);*/
	message.SenderName = decodeURIComponent(message.SenderName);
	message.Text = decodeURIComponent(escape(message.Text));

	// Name tag
	const name_tag = document.createElement("span");
	console.log(message.SenderName);
	console.log(message.AttachmentPath);
	name_tag.style.color = `hsl(${Math.abs(unsecure_string_hash(message.SenderName)) % 256}, 100%, 70%)`;
	name_tag.innerText = message.SenderName + ": ";
	name_tag.classList.add("name-tag");
	element.appendChild(name_tag);

	// Message text
	const text = document.createElement("span");
	text.innerText = message.Text;
	element.appendChild(text);

	if (message.AttachmentPath != "") {
		const img = document.createElement("img");
		img.src = message.AttachmentPath;
		element.appendChild(img);
	}

	insert_message(container);
}

let last_scroll_pos = 0;
function insert_message(message) {
	const messages = document.getElementById("messages");
	const at_bottom = messages.scrollHeight - messages.clientHeight - messages.scrollTop <= 2;
	messages.append(message);

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

function get(path) {
	return fetch(path + "/" + room_name + "/" + user_name)
}

function query_string_values() {
	return window.location.search.substring(1).split("&").map(mapping =>
		mapping.split("=")[1]);
}

function zoom_in_title() {
	const title = document.getElementById("welcome");
	title.innerText = `Welcome, ${user_name}`
	requestAnimationFrame(() => title.classList.add("enter"));
	setTimeout(() => {
		requestAnimationFrame(() => {
			const main = document.querySelector("main");
			main.classList.add("zoom-in");
			title.classList.add("float-away")
		});
		setTimeout(() => {
			title.remove();
		}, 400);
	}, 600);
}

function set_send_message_handlers() {
	const arrow = document.getElementById("arrow");
	const input = document.getElementById("msg_input");
	arrow.addEventListener("click", event => {
		const text = input.value;
		send_message(text);
	});
	const arrow_controller = () => {
		const value = input.value;
		if (value == "") {
			arrow.classList.remove("active");
		} else {
			arrow.classList.add("active");
		}
	}
	input.addEventListener("change", event => {
		requestAnimationFrame(arrow_controller);
	})
	input.addEventListener("keydown", event => {
		requestAnimationFrame(arrow_controller);
		requestAnimationFrame(() => {
			if (!event.shiftKey && event.code == "Enter") {
				input.value = input.value.slice(0, -1);
				if (input.textLength > 0)
					send_message(input.value);
			} else if (event.code === "ArrowUp") {
				if (history[history_index] !== undefined) {
					input.value = history[history_index];
					history_index--;
				}
			} else if (event.code === "ArrowDown") {
				if (history[history_index + 1] !== undefined) {
					history_index++;
					input.value = history[history_index];
				}
			}
		});
	});
}

function send_message(text) {
	if (history[history.length - 1] != text) {
		// Store in history
		history.push(text);
		history_index = history.length - 1;
	}

	// Empty field
	const input = document.getElementById("msg_input");
	input.value = "";

	// Disable send button
	const arrow = document.getElementById("arrow");
	arrow.classList.remove("active");

	// Run command instead of sending message if text starts with "/"
	if (text.startsWith("/")) {
		run_command(text);
		return;
	}

	// Send message
	fetch("sendmessage/" + room_name, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			SenderName: user_name,
			Text: text,
			AttachmentPath: undefined,
			TimeStamp: undefined
		})
	});
}

function run_command(text) {
	// Remove "/" from beginning
	text = text.substr(1);
	let words = text.split(" ");
	command_name = words[0];
	const command = find_command(command_name);
	if (!command) {
		// TODO make input red when command is not found or incorrectly formated
		display_command_message("Command not found");
	} else {
		const func = command.func;
		// Remove command name from words
		words.shift()
		// Call function with arguments
		func(words);
	}
}

function await_messages() {
	get("awaitmessages").then(response => {
		if (!response.ok) {
			display_dialog(`<h3>You have been disconnected</h3>
				<div class="button" style="margin-top: 12px" onclick="reconnect()">Reconnect</div>`);
			return;
		}
		response.text().then(text => {
			const list = base64_to_json(text);
			for (const message of list) {
				display_message(message);
			}
			await_messages();
		});
	}).catch(error => {
		display_dialog(error);
	});
}

function reconnect() {
	const dialogs = document.getElementsByClassName("dialog");
	for (const dialog of dialogs) {
		dialog.classList.remove("displayed");
		setTimeout(() => {
			dialog.remove()
		}, 200);
	}
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
	const text = document.createElement("span");
	text.innerHTML = message;
	element.appendChild(text);

	insert_message(container);
}

function send_attachment(path) {
	fetch(`/staticattachment/${room_name}/${user_name}/${path}`);
}

function display_dialog(content) {
	const dialog = document.createElement("div");
	dialog.classList.add("dialog");
	dialog.innerHTML = content;
	document.body.appendChild(dialog);
	requestAnimationFrame(() => {
		dialog.classList.add("displayed");
	});
}

/* ===================== Begin commands ===================== */

function help(args) {
	let text = "";
	if (args.length > 0) {
		command_name = args.length > 0 ? args[0] : "help";
		const command = find_command(command_name);
		if (command) {
			text = command.info + "\n" + command.extended;
		} else {
			text = "Could not find command " + command_name;
		}
	} else {
		for (command of commands) {
			text += `${command.name}: ${command.info}<br>`;
		}
	}
	display_command_message(text);
}

function img() {
	const html = `<div>Upload an image</div>
	<img src="uploadfile.svg"/>
	<div class="button">Cancel</div>`
	display_command_message(html);
}

function dance() {
	send_attachment("dance.gif");
}


function bg(number) {
	const main = document.querySelector("main");
	if (number == 0) {
		main.style.background = "transparent";
		display_command_message("Removed background image");
	} else {
		main.style.background = `url(backgrounds/bg${parseInt(number)}.jpg)`;
		display_command_message(`Set background image to bg${parseInt(number)}.jpg`);
	}
}

function goto(room) {
	window.location = `/room.html?room=${room}&name=${user_name}`;
}

function setname(name) {
	window.location = `/room.html?room=${room_name}&name=${name}`;
}

function beer() {
	send_attachment("beer.jfif");
}

/* ===================== End of commands ===================== */