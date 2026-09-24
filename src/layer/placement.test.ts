import { describe, expect, test } from "vitest";
import { placement_position_area, placement_position_try_fallbacks } from "./placement.ts";

describe("placement_position_area", () => {
	test("bottom-start aligns the start edges", () => {
		expect(placement_position_area("bottom-start")).toBe("self-block-end span-self-inline-end");
	});

	test("top stays a single block keyword so the browser can center it", () => {
		expect(placement_position_area("top")).toBe("self-block-start");
	});

	test("right-end uses the inline-end side", () => {
		expect(placement_position_area("right-end")).toBe("self-inline-end span-self-block-start");
	});
});

describe("placement_position_try_fallbacks", () => {
	test("centered placements add span slides after the flips", () => {
		expect(placement_position_try_fallbacks("bottom")).toBe(
			"flip-block, flip-inline, flip-block flip-inline, self-block-end span-self-inline-start, self-block-end span-self-inline-end, self-block-start span-self-inline-start, self-block-start span-self-inline-end",
		);
	});

	test("inline sides slide along the block axis with logical keywords", () => {
		expect(placement_position_try_fallbacks("left")).toBe(
			"flip-block, flip-inline, flip-block flip-inline, self-inline-start span-self-block-start, self-inline-start span-self-block-end, self-inline-end span-self-block-start, self-inline-end span-self-block-end",
		);
	});

	test("start alignment only flips", () => {
		expect(placement_position_try_fallbacks("bottom-start")).toBe("flip-block, flip-inline, flip-block flip-inline");
	});
});
