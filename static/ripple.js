document.addEventListener("DOMContentLoaded", init_ripple);

/* Test if passive events are supported */
let passive_supported = false;
try {
	const options = {
		get passive() {
			// This function will be called when the browser
			//   attempts to access the passive property.
			passive_supported = true;
			return false;
		}
	};

	window.addEventListener("test", null, options);
	window.removeEventListener("test", null, options);
} catch (err) {
	passive_supported = false;
}

function ripple_size(height, width) {
	return (Math.max(height, width) * Math.sqrt(2)) / 16;
}

function relative_click_coordinates(event, target) {
	let rect = target.getBoundingClientRect();
	return {
		x: event.pageX - rect.left,
		y: event.pageY - rect.top
	};
}

function applyStylesToRipple(element, event, target) {
	const parent_height = target.clientHeight,
		parent_width = target.clientWidth,
		size = ripple_size(
			target.clientHeight,
			target.clientWidth
		);

	const coords = relative_click_coordinates(event, target);
	element.style.top = coords.y - 8 + "px";
	element.style.left = coords.x - 8 + "px";
	element.style.transition = "500ms cubic-bezier(0.4, 0, 0.2, 1)";
	requestAnimationFrame(() => {
		element.style.transform = "scale(" + size + ")";
		element.style.top = parent_height / 2 - 8 + "px";
		element.style.left = parent_width / 2 - 8 + "px";
	}, 10);
}

function ripple_cleanup(ripple) {
	ripple.setAttribute("removal-scheduled", "f");
	window.setTimeout(function () {
		ripple.style.transition = "1200ms cubic-bezier(0, 0, 0.2, 1)";
		ripple.style.opacity = 0;
		ripple.style.width = "32px";
		ripple.style.height = "32px";
		window.setTimeout(function () {
			if (ripple)
				ripple.remove();
		}, 750);
	}, 120);
}

function create_ripple(parent) {
	const ripple_element = document.createElement("div");
	ripple_element.classList.add("ink-splash");
	parent.append(ripple_element);

	//Have to fetch newly appended element instead of sending rippleElement because it'll just be a copy otherwise
	return parent.lastChild;
}

function ripple_event_handler(event) {
	const target = event.currentTarget;
	requestAnimationFrame(() => {
		if (rippling_allowed) {
			rippling_allowed = false;
			
			if (!target.classList.contains("disabled")) {
				const ripple_element = create_ripple(target);
				applyStylesToRipple(ripple_element, event, target);
			}
			window.setTimeout(function () {
				rippling_allowed = true;
			}, 150);
		}
	});
}

function init_ripple() {
	/* 	For some reason the ripples cause other event listeners
	 *	to not fire on pale moon. I'm including Goanna and Gecko
	 *	too since I don't know where the issue lies and it's
	 *	better to be safe than sorry.
	 */
	if (navigator.userAgent.includes("PaleMoon") ||
		navigator.userAgent.includes("Goanna"))
		return;

	const ripple_containers = [].slice.call(
		document.getElementsByClassName("ripple")
	);

	//Apply event listener to each of the rippleContainers
	ripple_containers.forEach(function (element) {
		if (!element.hasAttribute("ripple-status")) {
			element.setAttribute("ripple-status", "activated");
			element.addEventListener("mousedown", function (event) {
				ripple_event_handler(event);
			});
			if (passive_supported) {
				element.addEventListener("touchstart", function (event) {
					ripple_event_handler(event);
				}, { passive: true });
			}
			else {
				element.addEventListener("touchstart", function (event) {
					ripple_event_handler(event);
				});
			}

			// Delete ripple if the mouse leaves the container
			element.addEventListener("mouseleave", function (event) {
				delete_all_ripples();
			});

			// Clean up ripples if mouseup or touchend occurs outside element
			document.addEventListener("mouseup", function (event) {
				delete_all_ripples();
			});

			document.addEventListener("touchend", function (event) {
				delete_all_ripples();
			});
		}
	});
}

// To stop both events from firing
let rippling_allowed = true;
let deleting_ripples_allowed = true;

function delete_all_ripples() {
	if (deleting_ripples_allowed) {
		deleting_ripples_allowed = false;
		const targets = document.getElementsByClassName("ink-splash");
		for (let target of targets) {
			if (!target.hasAttribute("removal-scheduled")) {
				ripple_cleanup(target);
			}
		}
		window.setTimeout(() => {
			deleting_ripples_allowed = true;
		}, 50);
    }
}