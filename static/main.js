"use strict";

let user_name = undefined;
let jwt_token = undefined;
let cookies_ok = false;

let friend_requests = [];

let history = [];
let history_index = 0;
let last_message_time = 1337;

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
	banner.innerHTML = `This website has cookies!
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
		document.cookie = "cookies_allowed=yes";
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
			if (!response.ok) {
				// TODO handle errors
				response.text().then(text => {
					if (text.startsWith("Error 1062")) {
						if (text.endsWith('users.name')) {
							display_snackbar("The name " + values.name + " has already been taken");
						} else {
							display_snackbar("The email " + values.email + " is already in use");
						}
					} else {
						display_snackbar("An unknown error occurred!");
					}
				});
			} else {
				check_logged_in();
			}
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
			if (!response.ok) {
				// TODO handle errors
				response.text().then(text => {
					display_snackbar(text);
				});
			} else {
				check_logged_in();
			}
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
	fade_out_title();
	hide_login_form();
	remove_background();
	set_action_center_listeners();
	set_remove_main_menu_listener();
	set_scroll_listener();
	show_profile_picture();
	check_friend_requests();
	populate_contacts_list();

	//load_account_screen_info();
	setTimeout(show_main, 100);
	setTimeout(() => {
		login.style.display = "none";
	}, 250);
}

function populate_contacts_list() {
	// TODO
	const button = create_contact_button();
}

function create_contact_button(name, last_message) {
	const contact = document.createElement("div");
	contact.classList.add("contact-container");

	contact.innerHTML = `<div class="contact ripple">
			<img class="profile-picture" src="/imgs/jocke.jpg">
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
		</svg>`;

	const profile_name = contact.getElementsByClassName("profile-name")[0];
	profile_name.innerText = name;

	const last_message_text = contact.getElementsByClassName("last-message")[0];
	last_message_text.innerText = last_message;

	return contact;
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
	// TODO NEW GROUP BUTTON FUNCTiONaLITY
	actions[1].addEventListener("click", open_request_friends);
	actions[2].addEventListener("click", open_invitations);
	/*for (const action of center.children) {
		action.addEventListener("click", open_action)
	}*/
}

function open_request_friends(event) {
	const sheet = create_sheet();

	// Fill sheet with content
	const search = copy_search_bar("Search users");
	search.addEventListener("input", search_for_users(sheet));
	sheet.appendChild(search);

	const results = document.createElement("div");
	results.classList.add("search-results");

	sheet.appendChild(results);
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
	const button = document.createElement("div");
	button.classList.add("contact-container");
	button.innerHTML = `<div class="contact ripple">
			<img class="profile-picture" src="/imgs/jocke.jpg">
			<div class="profile-name"></div>
			<div class="last-message"></div>
		</div>`;
	const hintbox = button.getElementsByClassName("last-message")[0];
	hintbox.innerText = hint;
	const nametag = button.getElementsByClassName("profile-name")[0];
	nametag.innerText = name;
	return button;
}

function send_friend_request(user_info) {
	const id = user_info.id;
	const name = decodeURIComponent(escape(user_info.name));
	display_snackbar("Friend request sent to " + name);
	get("sendfriendrequest", user_info.id).then(resp => {
		if (!resp.ok) {
			resp.text().then(text => {
				console.log(text);
				display_snackbar("Unable to send friend request, " + text);
			})
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
	// TODO also touch
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

function copy_search_bar(purpose) {
	// Copy
	const search_bar = document.getElementById("contact-search");
	const copy = search_bar.cloneNode(true);

	// Set placeholder
	const input = copy.getElementsByTagName("input")[0];
	input.setAttribute("placeholder", purpose);

	// Avoid duplicate id's
	copy.setAttribute("id", "request-search");

	return copy;
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
	return new Promise((resolve, reject) =>
		fetch("/validatejwt/" + unparsed_token).then(response => {
			if (response.ok) {
				response.text().then(text => {
					resolve(text === id);
				});
			} else {
				reject("Invalid");
			}
		}));
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

/*async function register_service_worker() {
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

function query_string_values() {
	return window.location.search.substring(1).split("&").map(mapping =>
		mapping.split("=")[1]);
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
}*/

/* ===================== Begin commands ===================== */

/*function help(arg) {
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
}*/

/* ===================== End of commands ===================== */