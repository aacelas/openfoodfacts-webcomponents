import type { CropperImageBoundingBox } from "../types"
import type { RobotoffBoundingBox } from "../types/robotoff"
import type {
  CropCorners,
  CropPoint,
  NormalizedBoundingBox,
  NormalizedPolygon,
} from "../types/crops"

/**
 * Converts a bounding box from the robotoff format to the crop image format.
 * @param boundingBox - The bounding box in the robotoff format.
 * @example [0, 0.407234539089848, 0.872586872586873, 0.998833138856476]
 * @returns The bounding box in the cropperjs image format.
 */
export const robotoffBoundingBoxToCropImageBoundingBox = (
  boundingBox: RobotoffBoundingBox,
  imageWidth: number,
  imageHeight: number
): CropperImageBoundingBox => {
  const [xMin, yMin, xMax, yMax] = boundingBox // values is a value between 0 and 1

  return {
    x: yMin * imageWidth,
    y: xMin * imageHeight,
    width: (yMax - yMin) * imageWidth,
    height: (xMax - xMin) * imageHeight,
  }
}

/**
 * Converts a bounding box from the crop image format to the robotoff format.
 * @param boundingBox - The bounding box in the cropperjs image format.
 * @returns The bounding box in the robotoff format.
 */
export const cropImageBoundingBoxToRobotoffBoundingBox = (
  boundingBox: CropperImageBoundingBox,
  imageWidth: number,
  imageHeight: number
): RobotoffBoundingBox => {
  const { x, y, width, height } = boundingBox
  const xMin = y / imageHeight
  const yMin = x / imageWidth
  const xMax = (y + height) / imageHeight
  const yMax = (x + width) / imageWidth
  return [xMin, yMin, xMax, yMax]
}

/**
 * Size of an image (or crop) once rotated by a multiple of 90°.
 * @param width - The width before rotation.
 * @param height - The height before rotation.
 * @param rotation - The rotation angle in degrees.
 * @returns The width and height after rotation.
 */
export const getRotatedSize = (
  width: number,
  height: number,
  rotation: number
): { width: number; height: number } => {
  const normalizedRotation = ((rotation % 360) + 360) % 360
  if (normalizedRotation === 90 || normalizedRotation === 270) {
    return { width: height, height: width }
  }
  return { width, height }
}

/**
 * Converts a bounding box in image pixels to a normalized one (values between 0 and 1).
 * Uses named keys to avoid any [y, x, y, x] vs [x, y, x, y] ordering confusion.
 * @param boundingBox - The bounding box in the cropperjs image format.
 * @returns The normalized bounding box.
 */
export const normalizeBoundingBox = (
  boundingBox: CropperImageBoundingBox,
  imageWidth: number,
  imageHeight: number
): NormalizedBoundingBox => {
  const { x, y, width, height } = boundingBox
  return {
    x_min: x / imageWidth,
    y_min: y / imageHeight,
    x_max: (x + width) / imageWidth,
    y_max: (y + height) / imageHeight,
  }
}

/**
 * Crops an image, then rotates the result.
 * @param image - The (loaded) source image.
 * @param boundingBox - The area to keep, in natural image pixels (unrotated frame).
 * @param rotation - The rotation angle in degrees (multiple of 90).
 * @param type - The output image type.
 * @param quality - The output image quality (between 0 and 1), for lossy types.
 * @returns The cropped image as a Blob.
 */
export const cropImageToBlob = async (
  image: CanvasImageSource,
  boundingBox: CropperImageBoundingBox,
  rotation = 0,
  type = "image/webp",
  quality?: number
): Promise<Blob> => {
  const x = Math.round(boundingBox.x)
  const y = Math.round(boundingBox.y)
  const width = Math.round(boundingBox.width)
  const height = Math.round(boundingBox.height)
  if (width < 1 || height < 1) {
    // a selection smaller than 1 image pixel would give an empty canvas (toBlob returns null)
    return Promise.reject(new Error("Crop area is too small"))
  }
  const canvas = drawRotatedCrop(image, x, y, width, height, rotation)
  return encodeCrop(canvas, type, quality)
}

function drawRotatedCrop(
  image: CanvasImageSource,
  x: number,
  y: number,
  width: number,
  height: number,
  rotation: number
) {
  const outputSize = getRotatedSize(width, height, rotation)

  const canvas = document.createElement("canvas")
  canvas.width = outputSize.width
  canvas.height = outputSize.height
  const ctx = canvas.getContext("2d")
  if (!ctx) {
    throw new Error("Canvas 2D context not available")
  }
  // rotate around the center of the output canvas, then draw the cropped area centered
  ctx.translate(outputSize.width / 2, outputSize.height / 2)
  ctx.rotate((rotation * Math.PI) / 180)
  ctx.drawImage(image, x, y, width, height, -width / 2, -height / 2, width, height)

  return canvas
}

function encodeCrop(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Failed to export cropped image"))),
      type,
      quality
    )
  })
}

export function getCornersBounds(corners: CropCorners): CropperImageBoundingBox {
  const xs = corners.map(({ x }) => x)
  const ys = corners.map(({ y }) => y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }
}

export function isConvexCrop(corners: CropCorners): boolean {
  return corners.every((a, index) => {
    const b = corners[(index + 1) % 4]
    const c = corners[(index + 2) % 4]
    return (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x) > 0
  })
}

/** Maps the unit square back to a convex source quadrilateral. */
export function getPerspectiveTransform(corners: CropCorners): (u: number, v: number) => CropPoint {
  if (!isConvexCrop(corners)) {
    throw new Error("Invalid perspective crop")
  }
  const [a, b, c, d] = corners
  const bx = b.x - c.x
  const by = b.y - c.y
  const dx = d.x - c.x
  const dy = d.y - c.y
  const sx = a.x - b.x + c.x - d.x
  const sy = a.y - b.y + c.y - d.y
  const determinant = bx * dy - dx * by
  const g = (sx * dy - dx * sy) / determinant
  const h = (bx * sy - sx * by) / determinant
  const ux = b.x * (1 + g) - a.x
  const uy = b.y * (1 + g) - a.y
  const vx = d.x * (1 + h) - a.x
  const vy = d.y * (1 + h) - a.y

  return (u, v) => {
    const w = 1 + g * u + h * v
    return { x: (ux * u + vx * v + a.x) / w, y: (uy * u + vy * v + a.y) / w }
  }
}

export function drawPerspectiveCrop(
  image: HTMLImageElement,
  corners: CropCorners,
  rotation: number
): HTMLCanvasElement {
  const transform = getPerspectiveTransform(corners)
  const [a, b, c, d] = corners
  const distance = (p: CropPoint, q: CropPoint) => Math.hypot(p.x - q.x, p.y - q.y)
  const width = Math.round(Math.max(distance(a, b), distance(d, c)))
  const height = Math.round(Math.max(distance(a, d), distance(b, c)))
  if (width < 1 || height < 1) {
    throw new Error("Crop area is too small")
  }

  const bounds = getCornersBounds(corners)
  const left = Math.floor(bounds.x)
  const top = Math.floor(bounds.y)
  const source = document.createElement("canvas")
  source.width = Math.ceil(bounds.x + bounds.width) - left
  source.height = Math.ceil(bounds.y + bounds.height) - top
  const input = source.getContext("2d")
  if (!input) {
    throw new Error("Canvas 2D context not available")
  }
  input.drawImage(image, -left, -top)
  const pixels = input.getImageData(0, 0, source.width, source.height).data

  const output = document.createElement("canvas")
  output.width = width
  output.height = height
  const context = output.getContext("2d")
  if (!context) {
    throw new Error("Canvas 2D context not available")
  }
  const result = context.createImageData(width, height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const point = transform((x + 0.5) / width, (y + 0.5) / height)
      const sampleX = Math.max(0, Math.min(source.width - 1, point.x - left - 0.5))
      const sampleY = Math.max(0, Math.min(source.height - 1, point.y - top - 0.5))
      const x0 = Math.floor(sampleX)
      const y0 = Math.floor(sampleY)
      const x1 = Math.min(x0 + 1, source.width - 1)
      const y1 = Math.min(y0 + 1, source.height - 1)
      const fx = sampleX - x0
      const fy = sampleY - y0
      const target = (y * width + x) * 4
      for (let channel = 0; channel < 4; channel++) {
        const upper =
          pixels[(y0 * source.width + x0) * 4 + channel] * (1 - fx) +
          pixels[(y0 * source.width + x1) * 4 + channel] * fx
        const lower =
          pixels[(y1 * source.width + x0) * 4 + channel] * (1 - fx) +
          pixels[(y1 * source.width + x1) * 4 + channel] * fx
        result.data[target + channel] = upper * (1 - fy) + lower * fy
      }
    }
  }
  context.putImageData(result, 0, 0)
  return rotation % 360 === 0 ? output : drawRotatedCrop(output, 0, 0, width, height, rotation)
}

export function normalizePolygon(
  [topLeft, topRight, bottomRight, bottomLeft]: CropCorners,
  imageWidth: number,
  imageHeight: number
): NormalizedPolygon {
  const normalize = ({ x, y }: CropPoint) => ({ x: x / imageWidth, y: y / imageHeight })
  return [normalize(topLeft), normalize(topRight), normalize(bottomRight), normalize(bottomLeft)]
}

export async function warpQuadToBlob(
  image: HTMLImageElement,
  corners: CropCorners,
  rotation: number,
  type: string,
  quality?: number
): Promise<Blob> {
  return encodeCrop(drawPerspectiveCrop(image, corners, rotation), type, quality)
}
