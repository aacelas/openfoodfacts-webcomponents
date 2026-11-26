import CropperImage from "@cropper/element-image"
import { afterEach, describe, expect, it, vi } from "vitest"
import "./image-crop"
import { CropMode } from "../shared/zoomable-image"
import type { ImageCropResult } from "../../types/crops"
import { warpQuadToBlob, drawPerspectiveCrop } from "../../utils/crop"

vi.mock("../../utils/crop", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/crop")>()),
  warpQuadToBlob: vi.fn(async () => new Blob()),
  drawPerspectiveCrop: vi.fn(() => ({ toDataURL: () => "data:image/png;base64," })),
}))

afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

async function createCrop(mode?: "polygon") {
  vi.spyOn(CropperImage.prototype, "$ready").mockImplementation(function (
    this: CropperImage,
    callback
  ) {
    Object.defineProperties(this.$image, {
      naturalWidth: { value: 200, configurable: true },
      naturalHeight: { value: 100, configurable: true },
    })
    callback?.(this.$image)
    return Promise.resolve(this.$image)
  })
  const crop = document.createElement("image-crop")
  if (mode) {
    crop.setAttribute("mode", mode)
    crop.boundingBox = { x: 20, y: 10, width: 120, height: 70 }
  }
  document.body.append(crop)
  await crop.updateComplete
  const zoomable = crop.zoomableImage
  await zoomable.updateComplete
  vi.spyOn(zoomable.imageElement, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 0, 200, 100)
  )
  zoomable.shadowRoot?.querySelector("crop-polygon-overlay")?.requestUpdate()
  await zoomable.shadowRoot?.querySelector("crop-polygon-overlay")?.updateComplete
  await zoomable.updateComplete
  return crop
}

describe("image-crop", () => {
  it("leaves perspective selection unavailable when the source fails to load", async () => {
    vi.spyOn(CropperImage.prototype, "$ready").mockRejectedValue(new Error("Image load failed"))
    const crop = document.createElement("image-crop")
    crop.mode = "polygon"
    document.body.append(crop)
    await crop.updateComplete
    await crop.zoomableImage.updateComplete
    expect(await crop.getCrop()).toBeNull()
    expect(crop.zoomableImage.shadowRoot?.querySelector("crop-polygon-overlay")).toBeNull()
  })

  it("defaults to rectangular selection", async () => {
    const crop = await createCrop()
    expect(crop.zoomableImage.cropMode).toBe(CropMode.CROP)
    expect(crop.zoomableImage.shadowRoot?.querySelector("crop-polygon-overlay")).toBeNull()
    expect(await crop.getCrop()).toBeNull()
  })

  it("moves corners with the keyboard and returns source and normalized coordinates", async () => {
    const crop = await createCrop("polygon")
    const zoomable = crop.zoomableImage
    const handles = zoomable
      .shadowRoot!.querySelector("crop-polygon-overlay")!
      .shadowRoot!.querySelectorAll<HTMLButtonElement>(".perspective-corner")
    expect(handles).toHaveLength(4)
    expect(handles[0].getAttribute("aria-label")).toBeTruthy()
    handles[0].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", shiftKey: true }))
    await zoomable.updateComplete

    const result = await crop.getCrop()
    expect(result?.polygon?.[0]).toEqual({ x: 30, y: 10 })
    expect(result?.normalizedPolygon?.[0]).toEqual({ x: 0.15, y: 0.1 })
    expect(result?.boundingBox).toEqual(crop.boundingBox)
    expect(warpQuadToBlob).toHaveBeenCalledWith(
      zoomable.imageElement.$image,
      result?.polygon,
      0,
      "image/webp",
      undefined
    )
  })

  it("previews and submits the same corners and rotation", async () => {
    const crop = await createCrop("polygon")
    const zoomable = crop.zoomableImage
    zoomable.rotateImage(90)
    const selection = zoomable.getCropSelection()
    await zoomable.showCrop()
    expect(drawPerspectiveCrop).toHaveBeenCalledWith(
      zoomable.imageElement.$image,
      selection?.corners,
      90
    )
    const result = new Promise<ImageCropResult>((resolve) =>
      crop.addEventListener(
        "crop",
        (event) => resolve((event as CustomEvent<ImageCropResult>).detail),
        {
          once: true,
        }
      )
    )
    await zoomable.updateComplete
    zoomable.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Validate crop"]')!.click()
    expect(await result).toMatchObject({ polygon: selection?.corners, rotation: 90 })
  })
})
