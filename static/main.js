"use strict";

let user_email = undefined;
let user_name = undefined;
let user_id = 0;

let jwt_token = undefined;
let cookies_ok = false;

let friend_requests = [];

let history = [];
let history_index = 0;
let last_message_id = 0;

/*const commands = [
	{ name: "help", func: help, arg: "none", info: "Displays a list of commands.", extended: "Type /help command to get in depth info about a command." },
	{ name: "say", func: say, arg: "string", info: "Speak your mind.", extended: "Type /say /say to say /say." },
	{ name: "dance", func: dance, arg: "number", info: "Use this to dance.", extended: "Type for example /dance 3 for dance number three or /dance for a radnom dance. There are 8 different dances." },
	{ name: "beer", func: beer, arg: "none", info: "Use this to beer.", extended: "Beer! Very unhealthy." },
	{ name: "1337", func: elit, arg: "none", info: "Eliiiiiiiit", extended: "Fett kool elit låda liksom." },
];*/

window.onload = main;
function main() {
	scale_in_title();
	set_background_position();
	click_form_input();
	check_logged_in();
	check_cookies_allowed();
	init_ripple();
	//register_service_worker();
}

function check_cookies_allowed() {
	const permission = are_cookies_allowed()
	if (permission == undefined) {
		display_cookie_banner();
	} else {
		cookies_ok = true;
	}
}

function are_cookies_allowed() {
	const res = find_cookie("cookies_allowed");
	return res ? res : undefined;
}

function display_cookie_banner() {
	are_cookies_allowed();
	const banner = document.createElement("div");
	banner.setAttribute("id", "cookie-banner");
	banner.innerHTML = `This website uses cookies!
	<div style="margin-bottom: 8px"></div>
	<a href="/privacy#cookies"><div class="button-flat">Read More</div></a>
	<div class="button" onclick="remove_cookie_banner()">OK</div>`;
	document.body.append(banner);
	requestAnimationFrame(() => banner.classList.add("displayed"));
}

function remove_cookie_banner() {
	const banner = document.getElementById("cookie-banner");
	banner.classList.remove("displayed");
	cookies_ok = true;
	setTimeout(() => {
		banner.remove();
		document.cookie = `cookies_allowed=true`;
	}, 300);
}

function set_background_position() {
	const y = Math.floor(Math.random() * 400) + 200;
	document.body.style.backgroundPosition = `0 ${y}px`;
}

function create_small_dialog(content) {
	const dialog = document.createElement("div");
	dialog.classList.add("dialog");
	return dialog;
}

function display_small_dialog(dialog) {
	const shade = document.createElement("div");
	shade.classList.add("dialog-shade");
	shade.appendChild(dialog);

	shade.addEventListener("click", event => {
		const target = event.target;
		if (target == shade) {
			remove_small_dialog(dialog);
		}
	});

	document.body.appendChild(shade);
	requestAnimationFrame(() => {
		shade.classList.add("displayed");
	});
}

function remove_small_dialog(dialog) {
	const shade = dialog.parentNode;
	shade.classList.remove("displayed");
	setTimeout(() => {
		shade.remove();
	}, 280);
}

function click_form_input() {
	const form = document.getElementById("auth-form-container");
	const inputs = Array.from(form.querySelectorAll("input")).reverse();
	setTimeout(() => {
		for (const input of inputs) {
			if (input.classList.contains("form-element-field")) {
				input.focus({
					preventScroll: true
				});
			}
		}
	}, 500);
}

function set_auth_cookie(value) {
	let date = new Date();
	date.setTime(date.getTime() + (31 * 24 * 60 * 60 * 1000));
	document.cookie = `auth=${value};expires=${date};path=/`;
}

function submit_signup_form(e) {
	const form = document.getElementById("signup");
	const values = form_values(form);
	if (values) {
		fetch("/signup", {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(values)
		}).then(response => {
			response.text().then(text => {
				if (!response.ok || text.includes(" ")) {
					if (text.startsWith("Error 1062")) {
						if (text.endsWith('users.name')) {
							display_snackbar("The name " + values.name + " has already been taken");
						} else {
							display_snackbar("The email " + values.email + " is already in use");
						}
					} else {
						display_snackbar("An unknown error occurred!");
					}
				} else {
					set_auth_cookie(text);
					check_logged_in();
				}
			});
		});
	}
	return false;
}

function submit_login_form(e) {
	const form = document.getElementById("login");
	const values = form_values(form);
	if (values) {
		fetch("/login", {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(values)
		}).then(response => {
			response.text().then(text => {
				if (!response.ok || text.includes(" ")) {
					display_snackbar(text);
				} else {
					set_auth_cookie(text);
					check_logged_in();
				}
			});
		});
	}
	return false;
}

function form_values(form) {
	"use strict";
	const inputs = form.querySelectorAll(`input:not([type="submit"])`);
	const names = ["email", "password", "name"];
	let valid = true;
	let values = {};
	for (let i = 0; i < inputs.length; i++) {
		if (inputs[i].validity.valid) {
			values[names[i]] = inputs[i].value;
		} else {
			if (inputs[i].value == "") {
				display_snackbar(`Your ${names[i]} is empty`);
			} else {
				display_snackbar(`Your ${names[i]} is badly formatted`);
			}
			valid = false;
		}
	}
	if (inputs.length === 3 && values.password.length < 8) {
		// TODO make form field red
		display_snackbar("Your password has to be at least 8 characters long");
		valid = false;
	}
	// Return false if form is invalid, else return form values
	return valid ? values : false;
}

function display_form() {
	float_title();
	const form = document.getElementById("auth-form-container");
	form.classList.add("fade-in");
}

// https://stackoverflow.com/questions/38552003/how-to-decode-jwt-token-in-javascript-without-using-a-library
function parse_jwt(token) {
	const base64_url = token.split('.')[1];
	const base64 = base64_url.replace(/-/g, '+').replace(/_/g, '/');
	const json_payload = decodeURIComponent(atob(base64).split('').map(function (c) {
		return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
	}).join(''));

	return JSON.parse(json_payload);
}

function find_cookie(name) {
	for (const cookie of document.cookie.split("; ")) {
		if (cookie.startsWith(name)) {
			return cookie.split("=")[1];
		}
	}
	return false;
}

function check_logged_in() {
	const login = () => setTimeout(display_form, 600);
	const auth = find_cookie("auth")
	if (auth) {
		const token = JSON.parse(atob(auth.split('.')[1]));
		// Check expiration before sending to server
		if (is_jwt_token_expired(token)) {
			login();
			return;
		}

		// Send to server to check against private key
		validate_jwt_token(auth, token.id).then(valid => {
			if (valid) {
				setTimeout(display_logged_in_ui, 800);
				jwt_token = auth;

				requestAnimationFrame(() => {
					const parsed = parse_jwt(jwt_token);
					user_email = parsed.aud;
					user_name = parsed.sub;
					user_id = parsed.id;
				})
			} else {
				login();
			}
		}).catch(reason => {
			// Invalid
			login();
		});
	} else {
		login();
	}
}

function display_logged_in_ui() {
	// Exit form view
	fade_out_title();
	hide_login_form();
	remove_background();

	// Add event listeners
	set_action_center_listeners();
	set_remove_main_menu_listener();
	set_contact_search_bar_listener();
	set_scroll_listener();

	// Display logged in data
	show_profile_picture();
	check_friend_requests();
	populate_contacts_list();

	setTimeout(show_main, 100);
	setTimeout(() => {
		login.style.display = "none";
	}, 250);
}

function set_contact_search_bar_listener() {
	// Add event listener to "x" button on input
	const search_bar = document.getElementById("contact-search");
	const input = search_bar.children[0];
	const cancel_button = search_bar.getElementsByClassName("cancel")[0];
	cancel_button.addEventListener("click", () => {
		input.value = "";
	});
}

function populate_contacts_list() {
	get("/fetchcontactlist/").then(resp => {
		resp.text().then(text => {
			if (resp.ok) {
				const contacts = base64_json_to_object(text)
				contacts.map(contact => {
					for (const field of ["groupName", "lastMessage"]) {
						contact[field] = decodeURIComponent(escape(contact[field]));
					}
					for (const field of ["lastEventTime", "createdAt"]) {
						contact[field] = Date(contact[field]);
					}
					return contact;
				});

				for (const contact_data of contacts) {
					const ぼたん = create_contact_button(contact_data);
					insert_contact_button(ぼたん);
				}
				requestAnimationFrame(init_ripple);
			} else {
				display_snackbar(text);
			}
		})
	});
}

function create_contact_button(data) {
	const contact = document.createElement("div");
	contact.classList.add("contact-container");

	contact.innerHTML = `<div class="contact ripple">
			<img class="profile-picture" src="profilepics/default.svg">
			<div class="profile-name"></div>
			<div class="last-message"></div>
		</div>
		<svg class="dots ripple" xmlns:svg="http://www.w3.org/2000/svg" xmlns="http://www.w3.org/2000/svg"
			version="1.1" viewBox="0 0 6.35 6.35" height="24" width="24">
			<ellipse ry="0.31523806" rx="0.31523785" cy="1.1906251" cx="3.175" id="path837"
				style="fill:#484848;fill-opacity:1;stroke:#484848;stroke-width:0.957024;stroke-miterlimit:4;stroke-dasharray:none;stroke-opacity:1;paint-order:markers fill stroke" />
			<ellipse
				style="fill:#484848;fill-opacity:1;stroke:#484848;stroke-width:0.957024;stroke-miterlimit:4;stroke-dasharray:none;stroke-opacity:1;paint-order:markers fill stroke"
				id="path837-9" cx="3.175" cy="3.175" rx="0.31523785" ry="0.31523806" />
			<ellipse ry="0.31523806" rx="0.31523785" cy="5.1593752" cx="3.175" id="path837-9-4"
				style="fill:#484848;fill-opacity:1;stroke:#484848;stroke-width:0.957024;stroke-miterlimit:4;stroke-dasharray:none;stroke-opacity:1;paint-order:markers fill stroke" />
		</svg>
	</div>`;

	// Define what to do when clicked
	contact.addEventListener("click", open_conversation(data));

	// Store metadata in element
	contact.setAttribute("data-groupID", data.groupID);
	contact.setAttribute("data-lastEventTime", data.lastEventTime);

	// Insert other information from server
	const profile_picture = contact.getElementsByClassName("profile-picture")[0];
	profile_picture.src = "profilepics/" + data.imageURL;

	const profile_name = contact.getElementsByClassName("profile-name")[0];
	profile_name.innerText = data.groupName;

	const last_message = contact.getElementsByClassName("last-message")[0];
	last_message.innerText = data.lastMessage;

	return contact;
}

function open_conversation(group_data) {
	return event => {
		close_all_big_windows();

		const big_window = create_big_window(group_data.groupName);

		// Reversal container to enable automatic resizing of textarea
		const content = document.createElement("div");
		content.className = "reversal-container";

		// Input to type messages
		const message_input = create_a_textarea();
		message_input.addEventListener("keydown", message_input_keydown(group_data));

		// Container for input to type messages
		const input_container = document.createElement("div");
		input_container.id = "message-input";
		input_container.appendChild(message_input);
		content.appendChild(input_container);

		// Enable clicking the send button to send messages 
		const send_button = message_input.getElementsByClassName("send-button")[0];
		send_button.addEventListener("click", () => send_message(message_input.children[0], group_data));

		// Container for messages
		const message_container = document.createElement("div");
		message_container.className = "messages"
		content.appendChild(message_container);

		// Add the reversal container to the big window
		big_window.appendChild(content);

		display_previous_messages(group_data);
		await_messages_from_group(group_data, message_container);
	};
}

function display_previous_messages(group_data) {
	get("/messages/", group_data.groupID).then(resp => {
		resp.text().then(text => {
			if (resp.ok) {
				const messages = base64_json_to_object(text);

				for (const message_data of messages) {
					const msg_element = create_message_element(message_data);
					insert_message(msg_element);
				}
			} else {
				display_snackbar(text);
			}
		});
	});
}

function insert_message(message_element) {
	const message_list = document.getElementsByClassName("messages")[0];
	const nodes = Array.from(message_list.children);
	const insert_timestamp = Date.parse(message_element.getAttribute("timestamp"));
	const insert_msg_id = message_element.getAttribute("id");

	// Check for duplicates
	if (
		nodes.find(node =>
			node.getAttribute("id") == insert_msg_id
		) != undefined
	) return;

	// Update last message time
	if (insert_msg_id > last_message_id)
		last_message_id = insert_msg_id;

	// Sort with the newest messages first
	const sorted = nodes.sort((a, b) => {
		const a_t = Date.parse(a.getAttribute("timestamp"));
		const b_t = Date.parse(b.getAttribute("timestamp"));
		return b_t - a_t;
	});

	/* 	Below: Insert the messages in reverse order
		because the message container is reversed
	*/

	// Look for older messages than this
	for (const node of sorted) {
		const this_timestamp = Date.parse(node.getAttribute("timestamp"));

		if (insert_timestamp > this_timestamp) {
			// Found an older message. Insert before it.
			message_list.insertBefore(message_element, node);
			return;
		}
	}

	// This is the oldest message. Insert it at the end of the message list.
	message_list.appendChild(message_element);
}

function create_message_element(message_data) {
	const message_container = document.createElement("div");
	message_container.classList.add("message-container");

	for (const key in message_data) {
		message_container.setAttribute(key, message_data[key]);
	}

	if (message_data.senderID == user_id) {
		message_container.classList.add("from-me");
	}

	const message = document.createElement("div");
	message.classList.add("message");
	// Change to correct encoding
	message.innerText = window.decodeURIComponent(window.escape(message_data.text));
	message_container.appendChild(message);

	return message_container;
}

function await_messages_from_group(group_data, message_container) {
	// Stop awaiting messages when the chat is closed
	if (message_container.parentNode == null) {
		return
	}

	get("/awaitmessages/", last_message_id + "/" + group_data.groupID).then(resp => {
		resp.text().then(text => {
			if (resp.ok) {
				const messages = base64_json_to_object(text);

				for (const message_data of messages) {
					const msg_element = create_message_element(message_data);
					insert_message(msg_element);
				}
				// Await more messages
				await_messages_from_group(group_data, message_container);
			} else {
				if (text == "Timeout") {
					// Await more messages
					await_messages_from_group(group_data, message_container);
				} else {
					display_snackbar(text);
				}
			}
		});
	});
}

function message_input_keydown(group_data) {
	return event => {
		const input = event.target;
		// TODO enter on mobile should not send
		if (!event.shiftKey && event.code == "Enter") {
			// Remove enter from the end of value
			requestAnimationFrame(() => {
				input.value = trim_enters(input.value);
				if (input.value.length > 0) {
					send_message(input, group_data);
				}
			});
		}
	}
}

function send_message(input, group_data) {
	// TODO MAX TEXT SIZE 1024 8-bit characters
	fetch("/sendmessage/" + jwt_token, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			text: input.value,
			groupID: group_data.groupID
		})
	}).then(resp => {
		if (resp.ok) {
			input.value = "";
		} else {
			display_snackbar("Could not send message. " + resp.text);
		}
	});
}

function create_big_window(title) {
	// Create window
	const big_window = document.createElement("div");
	big_window.classList.add("big-window");

	// Add header
	const header = document.createElement("header");
	header.innerText = title;

	// Add close button to header
	const close_button = document.createElement("div");
	close_button.classList.add("close-button");
	close_button.innerHTML = `<svg xmlns:svg="http://www.w3.org/2000/svg" xmlns="http://www.w3.org/2000/svg" version="1.1" viewBox="0 0 10 10" height="24" width="24">
		<path style="fill:none;fill-opacity:1;stroke:#212121;stroke-width:1.16947;stroke-linecap:butt;stroke-linejoin:miter;stroke-miterlimit:4;stroke-dasharray:none;stroke-opacity:1" d="M 1.1393294,1.1377215 8.8622351,8.8622932" id="path833" />
		<path id="path833-8" d="M 8.8609713,1.1377486 1.1392431,8.86238" style="fill:none;fill-opacity:1;stroke:#212121;stroke-width:1.16938;stroke-linecap:butt;stroke-linejoin:miter;stroke-miterlimit:4;stroke-dasharray:none;stroke-opacity:1" />
	</svg>`;
	close_button.addEventListener("click", close_all_big_windows);
	header.appendChild(close_button);

	// Add a notification bell to the header
	const bell = document.createElement("div");
	bell.classList.add("notif-bell");
	bell.innerHTML = `<svg xmlns:svg="http://www.w3.org/2000/svg" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 6.3499998 6.3499998" version="1.1">
		<path id="path836" d="M 1.9478849,1.4110091 1.3302316,5.056386 H 5.0506813 L 4.4442777,1.4110091 Z" style="fill:none;fill-opacity:1;stroke:#000000;stroke-width:0.341914;stroke-linecap:round;stroke-linejoin:round;stroke-miterlimit:4;stroke-dasharray:none;stroke-opacity:1" />
		<path sodipodi:nodetypes="cc" id="path838" d="m 2.3066466,1.3135106 c 0.00594,-1.27791911 1.7769213,-1.27090573 1.7675823,0.00913" style="fill:none;stroke:#000000;stroke-width:0.341914;stroke-linecap:butt;stroke-linejoin:miter;stroke-miterlimit:4;stroke-dasharray:none;stroke-opacity:1" />
		<path id="path840" d="M 3.1904559,5.1709312 V 5.5311636" style="fill:none;stroke:#000000;stroke-width:0.341914;stroke-linecap:butt;stroke-linejoin:miter;stroke-miterlimit:4;stroke-dasharray:none;stroke-opacity:1" />
		<circle r="0.41029888" cy="5.8446188" cx="3.1904562" id="path842" style="fill:#000000;fill-opacity:1;stroke:none;stroke-width:0.347641;stroke-linecap:round;stroke-linejoin:round;stroke-miterlimit:4;stroke-dasharray:none;paint-order:markers fill stroke" />
		<rect transform="rotate(-35)" ry="0.077817149" y="4.3833895" x="-2.7801442" height="0.31083247" width="6.993731" id="rect856" style="fill:#000000;fill-opacity:1;stroke:#f5f5f5;stroke-width:0.621666;stroke-linecap:round;stroke-linejoin:round;stroke-miterlimit:4;stroke-dasharray:none;stroke-opacity:1;paint-order:stroke markers fill" />
	</svg>`
	bell.addEventListener("click", () => {
		bell.classList.toggle("activated");
	});
	header.appendChild(bell);

	// Insert the header
	big_window.appendChild(header);

	// Insert window
	document.body.appendChild(big_window);

	// Animate insertion
	requestAnimationFrame(() => {
		big_window.classList.add("displayed");
	});

	return big_window;
}

function close_all_big_windows() {
	const big_windows = document.getElementsByClassName("big-window");
	for (const window of big_windows) {
		window.classList.remove("displayed");
		setTimeout(() => {
			window.remove();
		}, 200);
	}
}

function insert_contact_button(ぼたん) {
	const date = Date(ぼたん.getAttribute("data-lastEventTime"));

	const container = document.getElementById("contacts");
	for (const child of container.children) {
		// Duplicate found, don't insert
		if (ぼたん.getAttribute("data-groupID") == child.getAttribute("data-groupID")) {
			return;
		}

		// Sort in order of descending date
		const childDate = Date(child.getAttribute("data-lastEventTime"));
		if (date > childDate) {
			container.insertBefore(child, ぼたん);
			return;
		}
	}
	container.appendChild(ぼたん);
}

function check_friend_requests() {
	get("fetchfriendrequests").then(resp => {
		resp.text().then(text => {
			if (resp.ok) {
				const requests = base64_json_to_object(text);
				friend_requests = requests;
				if (requests.length > 0) {
					display_red_dot_on_invitations();
				}
			} else {
				display_snackbar(text);
			}
		});
	});
}

function create_red_dot() {
	const dot = document.createElement("div");
	dot.classList.add("red-dot");
	return dot;
}

function display_red_dot_on_invitations() {
	const dot = create_red_dot();
	dot.style.bottom = "6px";
	dot.style.left = "6px";

	const invitations = document.getElementById("invitations");
	invitations.appendChild(dot);
}

function set_scroll_listener() {
	const main = document.getElementsByTagName("main")[0];
	main.addEventListener("scroll", main_scroll);
}

function main_scroll(event) {
	const main = document.getElementsByTagName("main")[0];
	const header = main.getElementsByTagName("header")[0];
	const header_content = header.children[0];
	const content = document.getElementById("content");
	const scroll = main.scrollTop;
	if (scroll < 122) {
		const radius = ((122 - scroll) / 122) * 16;
		content.style.borderRadius = `${radius}px ${radius}px 0 0`;
		header_content.style.transform = `scale(${(122 - scroll / 5) / 122})`;
	} else {
		header_content.style.transform = `scale(0.5)`;
		content.style.borderRadius = `0`;
	}
}

function set_remove_main_menu_listener() {
	document.body.addEventListener("click", remove_main_menu);
}

function remove_main_menu(event) {
	const menu = document.getElementsByClassName("menu")[0];

	if (is_child_of(event.target, menu))
		return;

	if (menu && menu.children[0].classList.contains("displayed")) {
		const child_count = menu.childElementCount;
		for (const index of Array(child_count).keys()) {
			setTimeout(() => {
				menu.children[index].classList.remove("displayed");

				// If this is the last one, remove entire menu
				if (index == 0) {
					menu.classList.remove("displayed");
					setTimeout(() => {
						menu.remove();
					}, 400);
				}
			}, 30 * (child_count - index - 1));
		}
	}
}

function is_child_of(child, parent) {
	return (child == parent ? true :
		(child == document.body ? false :
			is_child_of(child.parentNode, parent)));
}

function show_profile_picture() {
	const pic = document.getElementsByClassName("my-profile-pic")[0];
	pic.style.backgroundImage = "url(/profilepics/default.svg)";
	get("profilepicurl").then(response => {
		if (response.ok) {
			response.text().then(url => {
				pic.style.backgroundImage = "url(/profilepics/" + url + ")";
			});
		}
	});

	pic.addEventListener("click", open_main_menu);
}

function open_main_menu(event) {
	const pic = event.currentTarget;
	const copy = pic.cloneNode(true);
	copy.style.right = "16px";
	copy.style.top = "16px";
	copy.style.position = "fixed";

	const menu = document.createElement("div");
	menu.classList.add("menu");
	menu.innerHTML += `
		<a href="/help" class="menu-option">Help</a>
		<a href="/tos" class="menu-option">Terms of Service</a>
		<a href="/privacy" class="menu-option">Privacy</a>
		<div class="menu-option">Settings</div>
		<div class="menu-option" onclick="log_out()">Log out</div>`;
	menu.appendChild(copy);

	const main = document.getElementsByTagName("main")[0];
	main.appendChild(menu);

	requestAnimationFrame(() => {
		menu.classList.add("displayed");
		for (const index of Array(menu.children.length).keys()) {
			const option = menu.children[index];
			option.classList.add("ripple");
			setTimeout(() => {
				option.classList.add("displayed");
			}, 50 + 60 * index)
		}
		requestAnimationFrame(init_ripple);
	})
}

function set_action_center_listeners() {
	const center = document.getElementById("action-center");
	const actions = document.getElementsByClassName("action");
	actions[0].addEventListener("click", open_request_friends);
	actions[1].addEventListener("click", open_create_group);
	actions[2].addEventListener("click", open_invitations);
}

function open_request_friends() {
	const sheet = create_sheet();

	// Fill sheet with content
	const search = create_a_search_bar("Search users");
	search.addEventListener("input", search_for_users(sheet));
	sheet.appendChild(search);

	const results = document.createElement("div");
	results.classList.add("search-results");

	sheet.appendChild(results);
}

async function open_create_group() {
	const sheet = create_sheet();

	let friend_list = [];
	const resp = await get("/fetchfriendlist/");
	const text = await resp.text();

	if (resp.ok) {
		const friends = base64_json_to_object(text);
		friends.map(friend => {
			friend.name = decodeURIComponent(friend.name);
			return friend;
		});
		friend_list = friends;
	} else {
		display_snackbar(text);
		return;
	}

	// Add a submit button
	const submit_button = document.createElement("div");
	submit_button.classList.add("button-flat");
	submit_button.innerText = "Create group"
	submit_button.addEventListener("click", create_group(sheet));
	sheet.appendChild(submit_button);

	// Add an input for the group name
	const group_name = create_a_search_bar("Group name", "pen");
	group_name.style.margin = "16px 16px 0 16px";
	sheet.appendChild(group_name);

	// Add a search bar to filter friends
	const search = create_a_search_bar("Search friends");
	search.style.marginTop = "4px";
	search.addEventListener("input", search_for_friends_to_add_to_group(sheet));
	sheet.appendChild(search);

	// Add a container for all the contacts
	const results = document.createElement("div");
	results.classList.add("search-results");

	const cancel_button = search.getElementsByClassName("cancel")[0];
	cancel_button.addEventListener("click", () => {
		for (const contact of results.children) {
			contact.classList.remove("disabled");
		}
	});
	search.appendChild(cancel_button);

	for (const friend of friend_list) {
		// Create a button to add friend to group
		const friend_button = create_friend_request_button(friend, "Tap to add to group");
		friend_button.addEventListener("click", _ => {
			friend_button.classList.toggle("selected");
		});

		// Add a checkmark to the button to show selection status
		const checkmark = document.createElement("img");
		checkmark.src = "icons/check.svg";
		checkmark.classList.add("checkmark");
		friend_button.children[0].appendChild(checkmark);

		// Add button to sheet
		results.appendChild(friend_button);
	}

	sheet.appendChild(results);
}

function create_group(sheet) {
	return event => {
		const group_name = sheet.getElementsByTagName("input")[0].value;
		const contact_container = sheet.getElementsByClassName("search-results")[0];
		const friends = Array.from(contact_container.children);
		const ids = friends.map(friend => parseInt(friend.getAttribute("data-id")));

		fetch("/creategroup/" + jwt_token, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				groupName: group_name,
				members: ids
			})
		}).then(resp => {
			if (resp.ok) {
				display_snackbar("Created group ", group_name)
				populate_contacts_list();
			} else {
				resp.text().then(text => {
					display_snackbar(text);
				});
			}
		});
	};
}

function search_for_friends_to_add_to_group(sheet) {
	return event => {
		const result_container = sheet.getElementsByClassName("search-results")[0];
		const input = event.target;
		requestAnimationFrame(() => {
			const query = input.value.toLowerCase();
			for (const friend of result_container.children) {
				if (friend.innerHTML.toLowerCase().includes(query)) {
					friend.classList.remove("disabled");
				} else {
					friend.classList.add("disabled");
				}
			}
		});
	}
}

function open_invitations() {
	const sheet = create_sheet();

	if (friend_requests.length == 0) {
		sheet.innerHTML += `<div class="center-content" style="margin-top: 24px; font-size: 24px;">
			No invitations
		</div>`;
	} else {
		for (const request of friend_requests) {
			// Put all friend requests into the sheet
			const button = create_friend_request_button(request, decodeURIComponent(escape(request.name)) + " wants to be your friend");
			button.addEventListener("click", () => dialog_accept_friend_request(request));
			sheet.appendChild(button);
		}
	}
}

function dialog_accept_friend_request(request) {
	// Create a dialog
	const dialog = create_small_dialog();
	const name = decodeURIComponent(escape(request.name));
	dialog.innerText = `Accept friend request from ${name}?`;

	// Space before buttons
	const margin = document.createElement("div");
	margin.style.marginTop = "16px";
	dialog.appendChild(margin);

	// Create buttons
	const accept_button = document.createElement("div");
	accept_button.className = "button-flat";
	accept_button.innerText = "Accept";
	const cancel_button = accept_button.cloneNode();
	cancel_button.innerText = "Cancel";

	// Define button functionality
	accept_button.addEventListener("click", () => {
		accept_friend_request(request);
		remove_small_dialog(dialog);
	});
	cancel_button.addEventListener("click", () => {
		remove_small_dialog(dialog);
	});

	// Insert said buttons
	dialog.appendChild(accept_button);
	dialog.appendChild(cancel_button);

	// Show the dialog
	display_small_dialog(dialog);
}

function accept_friend_request(request) {
	const name = decodeURIComponent(escape(request.name));
	get("acceptfriendrequest", request.id).then(resp => {
		if (resp.ok) {
			display_snackbar(`Accepted friend request from ${name}`);
		} else {
			if (resp.ok) {
				populate_contacts_list();
			}
			resp.text().then(text => {
				display_snackbar(text);
			});
		}
	});
}

function create_sheet() {
	const shade = fullscreen_shade();
	const sheet = document.createElement("div");
	sheet.classList.add("bottom-sheet");
	sheet.innerHTML += `<div class="expansion-container" onclick="bottom_sheet_expansion_clicked(this)">
		<div class="expansion-bar"></div>
		<div class="expansion-bar"></div>
	</div>`;

	document.body.appendChild(sheet);

	requestAnimationFrame(() => {

		// Add expanding-functionality
		sheet.addEventListener("mousedown", enable_sheet_movement(sheet));
		sheet.addEventListener("touchstart", enable_sheet_movement(sheet));

		// Add dismissing functionality
		const main = document.getElementsByTagName("main")[0];
		main.addEventListener("click", () => remove_bottom_sheet(sheet));
		shade.addEventListener("click", () => remove_bottom_sheet(sheet));

		// Show the sheet
		requestAnimationFrame(() => {
			obscure_main();
			sheet.style.top = "50%";
		});
	});

	return sheet;
}

function search_for_users(sheet) {
	return event => {
		const query = event.target.value;
		if (query == "") {
			return;
		}
		get("searchuser", query).then(response => {
			if (!response.ok)
				return;

			response.text().then(text => {
				const matches = base64_json_to_object(text);
				const results = sheet.getElementsByClassName("search-results")[0];
				if (matches.length > 0)
					results.innerHTML = "";
				for (const user_info of matches) {
					const button = create_friend_request_button(user_info, "Click to send a friend request!");
					button.addEventListener("click", () => send_friend_request(user_info));
					results.append(button);
				}
				requestAnimationFrame(init_ripple);
			});
		})
	}
}

// Used both to send and accept requests
function create_friend_request_button(user_info, hint) {
	const name = decodeURIComponent(escape(user_info.name));

	// Create the button
	const button = document.createElement("div");
	button.classList.add("contact-container");
	button.innerHTML = `<div class="contact ripple">
			<img class="profile-picture" src="/imgs/jocke.jpg">
			<div class="profile-name"></div>
			<div class="last-message"></div>
		</div>`;

	// Insert data
	button.setAttribute("data-id", user_info.id);

	const hintbox = button.getElementsByClassName("last-message")[0];
	hintbox.innerText = hint;

	const nametag = button.getElementsByClassName("profile-name")[0];
	nametag.innerText = name;

	return button;
}

function send_friend_request(user_info) {
	const id = user_info.id;
	const name = decodeURIComponent(escape(user_info.name));
	get("sendfriendrequest", user_info.id).then(resp => {
		if (!resp.ok) {
			resp.text().then(text => {
				display_snackbar("Unable to send friend request, " + text.toLowerCase());
			})
		} else {
			display_snackbar("Friend request sent to " + name);
		}
	})
}

function bottom_sheet_expansion_clicked(exp) {
	if (sheet_has_been_moved)
		return;
	if (exp.classList.contains("arrow")) {
		move_sheet({ direction: "middle" }, true);
	} else {
		move_sheet({ direction: "up" }, true)
	}
}

function obscure_main() {
	const main = document.getElementsByTagName("main")[0];
	main.style.transition = "300ms cubic-bezier(0.4, 0, 0.2, 1)";
	requestAnimationFrame(() => main.classList.add("obscured"));
}

let sheet_has_been_moved = false;
let sheet_movement_origin = 0;
function enable_sheet_movement(sheet) {
	return event => {
		sheet_has_been_moved = false;
		const touches = event.changedTouches;
		const top = sheet.getBoundingClientRect().top;
		sheet_movement_origin = top - (touches ? touches[0].pageY : event.pageY);

		document.addEventListener("mousemove", move_sheet);
		document.addEventListener("touchmove", move_sheet);

		document.addEventListener("mouseup", disable_sheet_movement);
		document.addEventListener("touchend", disable_sheet_movement);
	};
}

function move_sheet(event, anim = false) {
	const sheet = document.getElementsByClassName("bottom-sheet")[0];
	const main = document.getElementsByTagName("main")[0];

	// Do nothing if sheet is being removed (main is no longer obscured)
	if (!main.classList.contains("obscured"))
		return;

	// Handle both mouse and touch events
	let pageY = 0;
	const direction = event.direction;
	if (direction) {
		if (direction === "up") {
			pageY = 0;
		} else if (direction === "middle") {
			pageY = window.innerHeight / 2;
		}
	} else {
		sheet_has_been_moved = true;
		const touches = event.changedTouches;
		pageY = (touches ? touches[0].pageY : event.pageY) + sheet_movement_origin;
	}
	const percentage = pageY / window.innerHeight;

	// Return if outside screen
	if (!(0 <= percentage && percentage <= 1))
		return

	// Remove transitions unless told not to
	if (!anim) {
		sheet.style.transition = (main.style.transition = "none");
		apply_styles_move_sheet(sheet, main, percentage);
	} else {
		sheet.style.transition =
			main.style.transition = "200ms cubic-bezier(0.4, 0, 0.2, 1)";
		requestAnimationFrame(() => apply_styles_move_sheet(sheet, main, percentage));
	}
}

function apply_styles_move_sheet(sheet, main, percentage) {
	// Apply styles to sheet
	sheet.style.top = (percentage * 100) + "%";
	const sheetRadius = 32 * percentage;
	sheet.style.borderRadius = `${sheetRadius}px`;

	// Remove arrow formation from expansion bar if far down enough
	// or add it far up enough
	const exp = sheet.getElementsByClassName("expansion-container")[0];
	if (percentage > 0.25) {
		exp.classList.remove("arrow");
	} else {
		exp.classList.add("arrow");
	}

	// Apply styles to main
	const size = 0.84 + 0.16 * percentage;
	const mainRadius = 24 * (1 - percentage);
	if (size < 1) {
		main.style.transform = `scale(${size})`;
		main.style.borderRadius = `${mainRadius}px`;
	}
}

function disable_sheet_movement() {
	remove_sheet_if_far_down();
	fullscreen_sheet_if_high_up();
	document.removeEventListener("mousemove", move_sheet);
	document.removeEventListener("mouseup", disable_sheet_movement);
}

function remove_sheet_if_far_down() {
	const sheet = document.getElementsByClassName("bottom-sheet")[0];
	if (!sheet)
		return;
	const top = sheet.getBoundingClientRect().top;
	if (top > window.innerHeight * 0.70) {
		remove_bottom_sheet(sheet);
	}
}

function fullscreen_sheet_if_high_up() {
	const sheet = document.getElementsByClassName("bottom-sheet")[0];
	if (!sheet)
		return;

	const top = sheet.getBoundingClientRect().top;
	if (top < window.innerHeight * 0.3) {
		make_bottom_sheet_fullscreen(sheet);
	}
}

function make_bottom_sheet_fullscreen() {
	move_sheet({ direction: "up" }, true);
}

function remove_bottom_sheet(sheet) {
	sheet.style.transition = "200ms cubic-bezier(0.4, 0, 0.2, 1)";

	const main = document.getElementsByTagName("main")[0];
	main.classList.remove("obscured");
	main.setAttribute("style", "display: block");

	requestAnimationFrame(() => {
		sheet.style.top = "100%";
		remove_fullscreen_shade();
		setTimeout(() => {
			sheet.remove();
		}, 200);
	});
}

function create_a_search_bar(purpose, icon) {
	// Create search bar element
	const search_bar = document.createElement("div");
	search_bar.classList.add("input-container");

	// Add content to search bar
	search_bar.innerHTML = `<input type="text" placeholder="${purpose}">
		<svg class="input-icon" xmlns:svg="http://www.w3.org/2000/svg" xmlns="http://www.w3.org/2000/svg" xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd" version="1.1" viewBox="0 0 6.35 6.35" height="24" width="24">
			<path d="M 4.2336235,2.2489583 A 1.9846654,1.9846656 0 0 1 2.249088,4.233624 1.9846654,1.9846656 0 0 1 0.26429273,2.2492181 1.9846654,1.9846656 0 0 1 2.2485684,0.26429276 1.9846654,1.9846656 0 0 1 4.2336234,2.2484387" sodipodi:arc-type="arc" sodipodi:open="true" sodipodi:end="6.2829235" sodipodi:start="0" sodipodi:ry="1.9846656" sodipodi:rx="1.9846654" sodipodi:cy="2.2489583" sodipodi:cx="2.2489581" sodipodi:type="arc" style="fill:none;fill-opacity:1;stroke:#484848;stroke-width:0.528585;stroke-miterlimit:4;stroke-dasharray:none;stroke-opacity:1;paint-order:markers fill stroke"></path>
			<path d="M 3.6155998,3.6149312 6.1739834,6.1878656 Z" style="fill:none;stroke:#484848;stroke-width:0.496894;stroke-linecap:butt;stroke-linejoin:miter;stroke-miterlimit:4;stroke-dasharray:none;stroke-opacity:1"></path>
		</svg>
		<div class="cancel">
			<svg xmlns:svg="http://www.w3.org/2000/svg" xmlns="http://www.w3.org/2000/svg" version="1.1" viewBox="0 0 10 10" height="18" width="18">
				<path d="M 0.5,0.5 9.5,9.5" style="fill:none;stroke:#5a9271;stroke-width:1.4;stroke-linecap:butt;stroke-linejoin:miter;stroke-miterlimit:4;stroke-dasharray:none;stroke-opacity:1"></path>
				<path style="fill:none;stroke:#5a9271;stroke-width:1.4;stroke-linecap:butt;stroke-linejoin:miter;stroke-miterlimit:4;stroke-dasharray:none;stroke-opacity:1" d="M 9.5,0.5 0.5,9.5"></path>
			</svg>
		</div>`;

	// Add event listener to "x" button on input
	const input = search_bar.firstChild;
	const cancel_button = search_bar.getElementsByClassName("cancel")[0];
	cancel_button.addEventListener("click", () => {
		input.value = "";
	});

	if (icon == "pen") {
		// Create a pen icon
		const pen = document.createElement("img");
		pen.classList.add("input-icon");
		pen.src = "icons/pen.svg";

		// Replace magnifying glass with the pen icon
		const アメリア = search_bar.getElementsByClassName("input-icon")[0];
		アメリア.replaceWith(pen);
	}

	return search_bar;
}

function create_a_textarea() {
	// Create search bar element
	const container = document.createElement("div");
	container.classList.add("input-container");

	// Add content to search bar
	container.innerHTML = `<textarea placeholder="Type a message"></textarea>
		<img class="input-icon" src="icons/clip.svg">
		<img class="send-button" src="icons/airplane.svg">`;

	const textarea = container.children[0];

	textarea.addEventListener("input", event => {
		window.setTimeout(() => {
			/*  Without this the size only changes by one lineheight per activation
				and behaves weird in other ways. */
			textarea.style.height = 'auto';
			const lines = textarea.value.split("\n").length;
			const line_height = 20;
			const text_height = 7 + lines * line_height;
			// Fit text but take up at most half of the screen
			const height = Math.min(text_height, window.innerHeight / 2);
			textarea.style.height = height + "px";
			//console.log(height);
		}, 50);
	});

	// Assumes that the textarea is inserted quickly
	requestAnimationFrame(() => {
		requestAnimationFrame(() => {
			textarea.style.height = textarea.scrollHeight + "px";
		});
	});

	return container;
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

function fullscreen_shade() {
	// Shade is hidden on mobile
	const shade = document.createElement("div");
	shade.classList.add("shade");
	const insert = document.body.appendChild(shade);
	requestAnimationFrame(() => {
		shade.classList.add("displayed");
	});
	return insert;
}

function remove_fullscreen_shade() {
	const shade = document.getElementsByClassName("shade")[0];
	if (!shade)
		return
	shade.classList.remove("displayed");
	setTimeout(() => {
		shade.remove()
	}, 300);
}

function show_main() {
	document.body.style.backgroundImage = "none";
	const main = document.getElementsByTagName("main")[0];
	main.style.display = "block";
	requestAnimationFrame(() => {
		main.classList.add("displayed");
	});
}

function fade_out_title() {
	const app_title = document.getElementById("app-title");
	app_title.classList.add("fade-out");

	const logo = document.getElementById("app-logo");
	logo.classList.add("fade-out");

	setTimeout(() => {
		logo.style.display = "none";
		app_title.style.display = "none";
	}, 250);
}

function hide_login_form() {
	const login = document.getElementById("auth-form-container");
	login.classList.remove("fade-in");
	setTimeout(() => {
		login.style.display = "none";
	}, 250);
}

function remove_background() {
	document.body.classList.add("remove-background")
}

function is_jwt_token_expired(parsed_token) {
	const expiration = parsed_token.exp * 1000;
	return expiration < Date.now();
}

function validate_jwt_token(unparsed_token, id) {
	return new Promise((resolve, reject) => {
		// Have to fetch because get() uses a JWT token
		// that is not yet validated here
		fetch("/validatejwt/" + unparsed_token).then(response => {
			if (response.ok) {
				response.text().then(text => {
					resolve(text === id);
				});
			} else {
				reject("Invalid");
			}
		});
	});
}

function scale_in_title() {
	const title = document.getElementById("app-title");
	title.classList.add("scale-in");

	setTimeout(() => {
		const logo = document.getElementById("app-logo");
		logo.classList.add("scale-in");
	}, 300);
}

function float_title() {
	const title = document.getElementById("app-title");
	title.classList.add("float-up");

	const logo = document.getElementById("app-logo");
	logo.classList.add("float-up");
}

function display_other_form() {
	document.getElementById("auth-form-container").classList.toggle("show-next");
}

// Displays a message at the bottom of the screen for 3 seconds
function display_snackbar(message) {
	let container = document.getElementById("snackbar-container");
	if (!container)
		container = create_snackbar_container();

	const snackbar = create_snackbar(message);
	container.appendChild(snackbar);

	requestAnimationFrame(() =>
		requestAnimationFrame(() => {
			snackbar.classList.add("slideUp");
			setTimeout(() => {
				snackbar.classList.remove("slideUp");
				setTimeout(() => {
					snackbar.parentNode.removeChild(snackbar);
				}, 225);
			}, 3000);
		})
	);
}

function create_snackbar_container() {
	const container = document.createElement("div");
	container.setAttribute("id", "snackbar-container");
	return document.body.appendChild(container);
}

function create_snackbar(message) {
	const snackbar = document.createElement("div");
	snackbar.classList.add("snackbar");
	snackbar.innerHTML = `<span class="snackbar-content"></span>`;
	snackbar.children[0].innerText = message;
	return snackbar;
}

function get(path, data) {
	let location = `${path}/${jwt_token}`;
	if (data)
		location += "/" + data;
	return fetch(location);
}

function base64_json_to_object(string) {
	return JSON.parse(atob(string.split("\"").join("")));
}

function log_out() {
	document.cookie = "auth=0;expires=Thu, 01 Jan 1970 00:00:01 GMT"
	location.reload();
}
