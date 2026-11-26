import type CropperCanvas from "@cropper/element-canvas"
import type CropperImage from "@cropper/element-image"
import { localized, msg } from "@lit/localize"
import { css, html, LitElement, nothing } from "lit"
import { customElement, property } from "lit/decorators.js"
import { styleMap } from "lit/directives/style-map.js"
import type { CropCorners, CropPoint } from "../../types/crops"
import { normalizeRotation } from "../../utils"
import { isConvexCrop } from "../../utils/crop"

@customElement("crop-polygon-overlay")
@localized()
export class CropPolygonOverlay extends LitElement {
  static override styles = css`
    :host {
      position: absolute;
      inset: 0;
      pointer-events: none;
    }

    .perspective-outline {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
    }

    .perspective-corner {
      position: absolute;
      transform: translate(-50%, -50%);
      width: 32px;
      height: 32px;
      padding: 0;
      border: 0;
      border-radius: 50%;
      background: transparent;
      cursor: grab;
      pointer-events: auto;
      touch-action: none;
    }

    .perspective-corner::after {
      content: "";
      display: block;
      width: 14px;
      height: 14px;
      margin: auto;
      border: 2px solid #222;
      border-radius: 50%;
      background: white;
    }

    .perspective-corner:focus-visible {
      outline: 2px solid white;
      box-shadow: 0 0 0 4px #222;
    }
  `

  @property({ attribute: false })
  imageElement!: CropperImage

  @property({ attribute: false })
  canvasElement!: CropperCanvas

  @property({ attribute: false })
  corners?: CropCorners

  @property({ attribute: false })
  rotation = 0

  private activeCorner?: { pointerId: number; start: CropCorners; offsetX: number; offsetY: number }

  cancelDrag() {
    this.activeCorner = undefined
  }

  private updateCorners(corners: CropCorners) {
    this.corners = corners
    this.dispatchEvent(new CustomEvent<CropCorners>("polygon-change", { detail: corners }))
  }

  private rotateUnitPoint({ x, y }: CropPoint, rotation: number): CropPoint {
    switch (normalizeRotation(rotation)) {
      case 90:
        return { x: 1 - y, y: x }
      case 180:
        return { x: 1 - x, y: 1 - y }
      case 270:
        return { x: y, y: 1 - x }
      default:
        return { x, y }
    }
  }

  private moveCorner(index: number, x: number, y: number, width: number, height: number) {
    if (!this.corners || !width || !height) {
      return
    }
    const image = this.imageElement.$image
    const point = this.rotateUnitPoint(
      { x: Math.max(0, Math.min(1, x / width)), y: Math.max(0, Math.min(1, y / height)) },
      -this.rotation
    )
    const next: [CropPoint, CropPoint, CropPoint, CropPoint] = [...this.corners]
    next[index] = { x: point.x * image.naturalWidth, y: point.y * image.naturalHeight }
    if (isConvexCrop(next)) {
      this.updateCorners(next)
    }
  }

  private startCornerDrag(event: PointerEvent) {
    event.stopPropagation()
    if (!this.corners || event.button !== 0 || this.activeCorner) {
      return
    }
    const button = event.currentTarget as HTMLButtonElement
    button.setPointerCapture(event.pointerId)
    const rect = button.getBoundingClientRect()
    this.activeCorner = {
      pointerId: event.pointerId,
      start: this.corners,
      offsetX: event.clientX - rect.left - rect.width / 2,
      offsetY: event.clientY - rect.top - rect.height / 2,
    }
  }

  private dragCorner(event: PointerEvent, index: number) {
    const drag = this.activeCorner
    if (drag?.pointerId !== event.pointerId) {
      return
    }
    event.stopPropagation()
    const { left, top, width, height } = this.imageElement.getBoundingClientRect()
    this.moveCorner(
      index,
      event.clientX - left - drag.offsetX,
      event.clientY - top - drag.offsetY,
      width,
      height
    )
  }

  private endCornerDrag(event: PointerEvent) {
    if (this.activeCorner?.pointerId === event.pointerId) {
      event.stopPropagation()
      if (event.type === "pointercancel") {
        this.updateCorners(this.activeCorner.start)
      }
      this.activeCorner = undefined
    }
  }

  private moveCornerWithKey(event: KeyboardEvent, index: number, point: CropPoint) {
    if (event.key === "Escape" && this.activeCorner) {
      event.preventDefault()
      this.updateCorners(this.activeCorner.start)
      this.activeCorner = undefined
      return
    }
    const steps: Record<string, CropPoint> = {
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
      ArrowUp: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 },
    }
    const delta = Object.hasOwn(steps, event.key) ? steps[event.key] : undefined
    if (!delta) {
      return
    }
    event.preventDefault()
    const { width, height } = this.imageElement.getBoundingClientRect()
    const step = event.shiftKey ? 10 : 1
    this.moveCorner(
      index,
      point.x * width + delta.x * step,
      point.y * height + delta.y * step,
      width,
      height
    )
  }

  override render() {
    if (!this.corners) {
      return nothing
    }
    const { naturalWidth, naturalHeight } = this.imageElement.$image
    const { width, height } = this.imageElement.getBoundingClientRect()
    const canvas = this.canvasElement.getBoundingClientRect()
    const image = this.imageElement.getBoundingClientRect()
    const offset = { x: image.left - canvas.left, y: image.top - canvas.top }
    const labels = [
      msg("Resize top left"),
      msg("Resize top right"),
      msg("Resize bottom right"),
      msg("Resize bottom left"),
    ]
    const rotationSteps = normalizeRotation(this.rotation) / 90
    const points = this.corners.map(({ x, y }) =>
      this.rotateUnitPoint({ x: x / naturalWidth, y: y / naturalHeight }, this.rotation)
    )
    const positions = points.map(({ x, y }) => ({
      x: x * width + offset.x,
      y: y * height + offset.y,
    }))
    const polygon = positions.map(({ x, y }) => `${x},${y}`).join(" ")
    return html`
      <svg class="perspective-outline" aria-hidden="true">
        <polygon points=${polygon} fill="none" stroke="#222" stroke-width="4" />
        <polygon points=${polygon} fill="none" stroke="white" stroke-width="2" />
      </svg>
      ${positions.map(
        ({ x, y }, index) => html`
          <button
            type="button"
            class="perspective-corner"
            style=${styleMap({ left: `${x}px`, top: `${y}px` })}
            aria-label=${labels[(index + rotationSteps) % 4]}
            aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight"
            @pointerdown=${this.startCornerDrag}
            @pointermove=${(event: PointerEvent) => this.dragCorner(event, index)}
            @pointerup=${this.endCornerDrag}
            @pointercancel=${this.endCornerDrag}
            @lostpointercapture=${this.endCornerDrag}
            @keydown=${(event: KeyboardEvent) => this.moveCornerWithKey(event, index, points[index])}
          ></button>
        `
      )}
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "crop-polygon-overlay": CropPolygonOverlay
  }
}
