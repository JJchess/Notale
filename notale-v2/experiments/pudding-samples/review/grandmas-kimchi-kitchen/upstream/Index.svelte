<script>
	import { getContext } from "svelte";
	import Kimchi from "$components/kimchi/kimchi.main.svelte";
	import WIP from "$components/helpers/WIP.svelte";
	import Footer from "$components/Footer.svelte";

	const copy = getContext("copy");
	for (let i in copy) {
		if (copy[i][0].type != undefined) {
			let counter = 0;
			let clickCounter = 0;
			for (let j in copy[i]) {
				copy[i][j]["keyboardSelect"] = "False";
				copy[i][j]["clickCounter"] = -1;
				copy[i][j]["num"] = counter;
				copy[i][j]["xPos"] = "left";
				copy[i][j]["yPos"] = "top";
				if (
					(copy[i][j]["x"] > 25 && copy[i][j]["x"] < 50) ||
					copy[i][j]["x"] > 75
				) {
					copy[i][j]["xPos"] = "right";
				}
				if (copy[i][j]["y"] > 50) {
					copy[i][j]["yPos"] = "bottom";
				}
				if (copy[i][j]["addclass"] == undefined) {
					copy[i][j]["addclass"] = "";
				}
				if (copy[i][j]["notouch"] == undefined) {
					copy[i][j]["notouch"] = "";
				}
				if (copy[i][j]["clicked"] == "false") {
					copy[i][j]["clickable"] = true;
				} else {
					copy[i][j]["clickable"] = false;
				}
				if (copy[i][j]["notouch"] != "none" && copy[i][j]["hed"] != "speaker") {
					copy[i][j]["clickCounter"] = clickCounter;
					clickCounter++;
				}
				counter++;
			}
		}
	}
	// const data = getContext("data");
</script>

<!-- <WIP /> -->
<div class="wrapper">
	<Kimchi {copy} />
</div>
<Footer />

<style>
	.wrapper {
		min-height: 480px;
	}
</style>
