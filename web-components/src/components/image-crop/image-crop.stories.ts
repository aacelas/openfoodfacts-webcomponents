import "./image-crop"

import { html } from "lit"
import { msg } from "@lit/localize"
import type { Meta, StoryObj } from "@storybook/web-components-vite"
import type { ImageCrop } from "./image-crop"
import type { ImageCropResult } from "../../types/crops"

const SAMPLE_IMAGE = "https://images.openfoodfacts.org/images/products/301/762/042/2003/1.jpg"

const ANGLED_LABEL = `data:image/svg+xml,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="600" height="420" viewBox="0 0 600 420">
    <rect width="600" height="420" fill="#9dbaa7"/>
    <path d="M165 35L488 65L555 372L57 354Z" fill="#264638"/>
    <path d="M197 105L443 122L481 308L135 294Z" fill="#fff9ea"/>
    <g fill="#264638" font-family="sans-serif" transform="matrix(.89 .044 -.16 1 213 153)">
      <text font-size="25" font-weight="bold">INGREDIENTS</text>
      <text y="41" font-size="20">Oats, roasted almonds,</text>
      <text y="72" font-size="20">honey, coconut oil,</text>
      <text y="103" font-size="20">sea salt and cinnamon.</text>
    </g>
  </svg>
`)}`

const showResult = (story: HTMLElement, result: ImageCropResult | null) => {
  const output = story.querySelector("#crop-output")!
  if (!result) {
    output.textContent = "No selection"
    return
  }
  output.innerHTML = ""
  const img = document.createElement("img")
  img.alt = msg("Cropped Image")
  img.src = URL.createObjectURL(result.blob)
  img.style.maxWidth = "100%"
  const pre = document.createElement("pre")
  pre.textContent = JSON.stringify(
    { ...result, blob: { type: result.blob.type, size: result.blob.size } },
    null,
    2
  )
  output.append(img, pre)
}

const meta: Meta = {
  title: "Components/Image Crop",
  component: "image-crop",
  args: {
    src: SAMPLE_IMAGE,
    "show-buttons": true,
  },
}
export default meta

type Story = StoryObj

/**
 * Built-in buttons: "Show crop" then "Validate crop" fires the `crop` event.
 */
export const Basic: Story = {
  render: (args) => html`
    <div>
      <image-crop
        src=${args.src}
        mode=${args.mode ?? "rectangle"}
        ?show-buttons=${args["show-buttons"]}
        @crop=${(event: CustomEvent<ImageCropResult>) =>
          showResult((event.target as HTMLElement).parentElement!, event.detail)}
      ></image-crop>
      <div id="crop-output"></div>
    </div>
  `,
}

/**
 * Built-in buttons hidden: the parent calls `getCrop()` from its own button.
 */
export const HiddenActions: Story = {
  render: (args) => html`
    <div>
      <image-crop src=${args.src} ?show-buttons=${args["show-buttons"]} hide-actions></image-crop>
      <button
        @click=${async (event: Event) => {
          const story = (event.target as HTMLElement).parentElement!
          const cropper = story.querySelector("image-crop") as ImageCrop
          showResult(story, await cropper.getCrop())
        }}
      >
        Save
      </button>
      <div id="crop-output"></div>
    </div>
  `,
}

/** Move the four corners around an angled label, then preview the straightened crop. */
export const Polygon: Story = {
  ...Basic,
  args: { mode: "polygon", src: ANGLED_LABEL },
}
