/**
 * @Author Awen
 * @Date 2024/06/01
 * @Email wengaolng@gmail.com
 **/

import {MutableRefObject, useCallback, useEffect, useRef} from "react";
import {SlideRegionData, SlideRegionPoint} from "../meta/data";
import {SlideRegionEvent} from "../meta/event";

interface DragGeometry {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startPosition: SlideRegionPoint;
  maxX: number;
  maxY: number;
}

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max)

export const useHandler = (
  data: SlideRegionData,
  event: SlideRegionEvent,
  containerRef: MutableRefObject<any>,
  tileRef: MutableRefObject<any>,
  clearCbs: () => void,
) => {
  const dataRef = useRef(data)
  const eventRef = useRef(event)
  const positionRef = useRef<SlideRegionPoint>({x: data.thumbX || 0, y: data.thumbY || 0})
  const pendingPositionRef = useRef<SlideRegionPoint | null>(null)
  const dragGeometryRef = useRef<DragGeometry | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const hasMovedRef = useRef(false)

  dataRef.current = data
  eventRef.current = event

  const applyPosition = useCallback((position: SlideRegionPoint, notifyMove = false) => {
    const initialX = dataRef.current.thumbX || 0
    const initialY = dataRef.current.thumbY || 0
    positionRef.current = position

    if (tileRef.current) {
      tileRef.current.style.transform = `translate3d(${position.x - initialX}px, ${position.y - initialY}px, 0)`
    }
    if (notifyMove) {
      eventRef.current.move && eventRef.current.move(position.x, position.y)
    }
  }, [tileRef])

  const flushAnimationFrame = useCallback((notifyMove = true) => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }

    const position = pendingPositionRef.current
    pendingPositionRef.current = null
    if (position) {
      applyPosition(position, notifyMove)
    }
  }, [applyPosition])

  const schedulePosition = useCallback((position: SlideRegionPoint) => {
    pendingPositionRef.current = position
    if (animationFrameRef.current !== null) {
      return
    }

    animationFrameRef.current = requestAnimationFrame(() => {
      animationFrameRef.current = null
      const nextPosition = pendingPositionRef.current
      pendingPositionRef.current = null
      if (nextPosition) {
        applyPosition(nextPosition, true)
      }
    })
  }, [applyPosition])

  const clearActiveDrag = useCallback(() => {
    const geometry = dragGeometryRef.current
    const tile = tileRef.current
    dragGeometryRef.current = null
    hasMovedRef.current = false
    if (geometry && tile && tile.hasPointerCapture && tile.hasPointerCapture(geometry.pointerId)) {
      tile.releasePointerCapture(geometry.pointerId)
    }
    pendingPositionRef.current = null
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
  }, [tileRef])

  const resetData = useCallback(() => {
    clearActiveDrag()
    applyPosition({x: dataRef.current.thumbX || 0, y: dataRef.current.thumbY || 0})
  }, [applyPosition, clearActiveDrag])

  useEffect(() => {
    resetData()
  }, [data.thumbX, data.thumbY, data.image, data.thumb, resetData])

  useEffect(() => () => {
    clearActiveDrag()
  }, [clearActiveDrag])

  const dragEvent = useCallback((e: any) => {
    if (e.button !== undefined && e.button !== 0) {
      return
    }
    if (!containerRef.current || !tileRef.current) {
      return
    }

    clearActiveDrag()

    const width = containerRef.current.offsetWidth
    const height = containerRef.current.offsetHeight
    const tileWidth = tileRef.current.offsetWidth
    const tileHeight = tileRef.current.offsetHeight

    dragGeometryRef.current = {
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startPosition: positionRef.current,
      maxX: Math.max(0, width - tileWidth),
      maxY: Math.max(0, height - tileHeight),
    }
    hasMovedRef.current = false

    tileRef.current.setPointerCapture && tileRef.current.setPointerCapture(e.pointerId)
    e.preventDefault()
  }, [clearActiveDrag, containerRef, tileRef])

  const getPositionFromPointerEvent = useCallback((e: PointerEvent): SlideRegionPoint | null => {
    const geometry = dragGeometryRef.current
    if (!geometry || geometry.pointerId !== e.pointerId) {
      return null
    }

    return {
      x: clamp(geometry.startPosition.x + e.clientX - geometry.startClientX, 0, geometry.maxX),
      y: clamp(geometry.startPosition.y + e.clientY - geometry.startClientY, 0, geometry.maxY),
    }
  }, [])

  const moveEvent = useCallback((e: PointerEvent) => {
    const position = getPositionFromPointerEvent(e)
    if (!position) {
      return
    }

    const geometry = dragGeometryRef.current
    if (geometry && (position.x !== geometry.startPosition.x || position.y !== geometry.startPosition.y)) {
      hasMovedRef.current = true
    }
    schedulePosition(position)
    e.preventDefault()
  }, [getPositionFromPointerEvent, schedulePosition])

  const upEvent = useCallback((e: PointerEvent) => {
    const geometry = dragGeometryRef.current
    if (!geometry || geometry.pointerId !== e.pointerId) {
      return
    }

    const position = getPositionFromPointerEvent(e)
    if (position) {
      if (position.x !== geometry.startPosition.x || position.y !== geometry.startPosition.y) {
        hasMovedRef.current = true
      }
      schedulePosition(position)
    }
    flushAnimationFrame(hasMovedRef.current)
    const point = positionRef.current
    const hasMoved = hasMovedRef.current
    clearActiveDrag()

    if (!hasMoved) {
      return
    }

    eventRef.current.confirm && eventRef.current.confirm({
      x: Math.trunc(point.x),
      y: Math.trunc(point.y),
    }, resetData)
    e.preventDefault()
  }, [clearActiveDrag, flushAnimationFrame, getPositionFromPointerEvent, resetData, schedulePosition])

  const cancelEvent = useCallback((e: PointerEvent) => {
    const geometry = dragGeometryRef.current
    if (geometry && geometry.pointerId === e.pointerId) {
      clearActiveDrag()
    }
  }, [clearActiveDrag])

  useEffect(() => {
    const tile = tileRef.current
    if (!tile) {
      return
    }

    tile.addEventListener('pointermove', moveEvent)
    tile.addEventListener('pointerup', upEvent)
    tile.addEventListener('pointercancel', cancelEvent)
    tile.addEventListener('lostpointercapture', cancelEvent)

    return () => {
      tile.removeEventListener('pointermove', moveEvent)
      tile.removeEventListener('pointerup', upEvent)
      tile.removeEventListener('pointercancel', cancelEvent)
      tile.removeEventListener('lostpointercapture', cancelEvent)
    }
  }, [cancelEvent, moveEvent, tileRef, upEvent])

  const clearData = useCallback(() => {
    resetData()
    clearCbs && clearCbs()
  }, [resetData, clearCbs])

  const close = useCallback(() => {
    clearActiveDrag()
    eventRef.current.close && eventRef.current.close()
    resetData()
  }, [clearActiveDrag, resetData])

  const refresh = useCallback(() => {
    clearActiveDrag()
    eventRef.current.refresh && eventRef.current.refresh()
    resetData()
  }, [clearActiveDrag, resetData])

  const closeEvent = useCallback((e: any) => {
    close()
    e.preventDefault()
    return false
  }, [close])

  const refreshEvent = useCallback((e: any) => {
    refresh()
    e.preventDefault()
    return false
  }, [refresh])

  return {
    dragEvent,
    closeEvent,
    refreshEvent,
    resetData,
    clearData,
    close,
    refresh,
  }
}
