import { describe, it, expect } from "vitest"
import type { CropCorners } from "../types/crops"
import {
  cropImageToBlob,
  getCornersBounds,
  getPerspectiveTransform,
  getRotatedSize,
  normalizeBoundingBox,
  normalizePolygon,
} from "./crop"

describe("crop utils", () => {
  describe("getRotatedSize", () => {
    it("should keep the size for 0° and 180°", () => {
      expect(getRotatedSize(200, 100, 0)).toEqual({ width: 200, height: 100 })
      expect(getRotatedSize(200, 100, 180)).toEqual({ width: 200, height: 100 })
      expect(getRotatedSize(200, 100, -180)).toEqual({ width: 200, height: 100 })
    })

    it("should swap width and height for 90° and 270°", () => {
      expect(getRotatedSize(200, 100, 90)).toEqual({ width: 100, height: 200 })
      expect(getRotatedSize(200, 100, 270)).toEqual({ width: 100, height: 200 })
      expect(getRotatedSize(200, 100, -90)).toEqual({ width: 100, height: 200 })
    })
  })

  describe("normalizeBoundingBox", () => {
    it("should return values relative to the image size", () => {
      expect(normalizeBoundingBox({ x: 50, y: 25, width: 100, height: 50 }, 200, 100)).toEqual({
        x_min: 0.25,
        y_min: 0.25,
        x_max: 0.75,
        y_max: 0.75,
      })
    })

    it("should return the full image for a full selection", () => {
      expect(normalizeBoundingBox({ x: 0, y: 0, width: 640, height: 480 }, 640, 480)).toEqual({
        x_min: 0,
        y_min: 0,
        x_max: 1,
        y_max: 1,
      })
    })
  })

  describe("cropImageToBlob", () => {
    it("should reject a crop area smaller than 1 image pixel", async () => {
      const image = document.createElement("img")
      await expect(
        cropImageToBlob(image, { x: 10, y: 10, width: 0.4, height: 50 })
      ).rejects.toThrow("Crop area is too small")
      await expect(
        cropImageToBlob(image, { x: 10, y: 10, width: 50, height: 0.2 })
      ).rejects.toThrow("Crop area is too small")
    })
  })
})

describe("perspective crop", () => {
  const trapezoid: CropCorners = [
    { x: 20, y: 10 },
    { x: 80, y: 10 },
    { x: 100, y: 70 },
    { x: 0, y: 70 },
  ]

  it("normalizes each corner against the source dimensions in order", () => {
    expect(normalizePolygon(trapezoid, 100, 80)).toEqual([
      { x: 0.2, y: 0.125 },
      { x: 0.8, y: 0.125 },
      { x: 1, y: 0.875 },
      { x: 0, y: 0.875 },
    ])
  })

  it("maps the corners and the vanishing-point interpolation of a trapezoid", () => {
    const map = getPerspectiveTransform(trapezoid)
    expect(map(0, 0)).toEqual(trapezoid[0])
    expect(map(1, 0)).toEqual(trapezoid[1])
    expect(map(1, 1).x).toBeCloseTo(trapezoid[2].x)
    expect(map(1, 1).y).toBeCloseTo(trapezoid[2].y)
    expect(map(0, 1).x).toBeCloseTo(trapezoid[3].x)
    expect(map(0, 1).y).toBeCloseTo(trapezoid[3].y)
    expect(map(0.5, 0.5).x).toBeCloseTo(50)
    expect(map(0.5, 0.5).y).toBeCloseTo(32.5)
    expect(getCornersBounds(trapezoid)).toEqual({ x: 0, y: 10, width: 100, height: 60 })
  })

  it("maps a rectangle linearly", () => {
    const map = getPerspectiveTransform([
      { x: 10, y: 20 },
      { x: 90, y: 20 },
      { x: 90, y: 60 },
      { x: 10, y: 60 },
    ])
    expect(map(0.25, 0.75)).toEqual({ x: 30, y: 50 })
  })

  it("rejects crossed and collapsed selections", () => {
    const [a, b, c, d] = trapezoid
    expect(() => getPerspectiveTransform([a, c, b, d])).toThrow("Invalid perspective crop")
    expect(() => getPerspectiveTransform([a, b, b, d])).toThrow("Invalid perspective crop")
    expect(() => getPerspectiveTransform([a, b, { x: 50, y: 20 }, d])).toThrow(
      "Invalid perspective crop"
    )
  })
})
