/**
 * @Author Awen
 * @Date 2024/06/01
 * @Email wengaolng@gmail.com
 **/

import {MutableRefObject, useCallback, useEffect, useRef} from "react";
import {RotateData} from "../meta/data";
import {RotateEvent} from "../meta/event";

interface Position {
  dragLeft: number;
  thumbAngle: number;
}

interface DragGeometry {
  pointerId: number;
  startClientX: number;
  startPosition: Position;
  maxDragLeft: number;
  thumbRatio: number;
}

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max)

export const useHandler = (
  data: RotateData,
  event: RotateEvent,
  dragBlockRef: MutableRefObject<any>,
  dragBarRef: MutableRefObject<any>,
  thumbBlockRef: MutableRefObject<any>,
  clearCbs: () => void,
) => {
  const dataRef = useRef(data)
  const eventRef = useRef(event)
  const positionRef = useRef<Position>({dragLeft: 0, thumbAngle: data.angle || 0})
  const pendingPositionRef = useRef<Position | null>(null)
  const dragGeometryRef = useRef<DragGeometry | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const hasMovedRef = useRef(false)

  dataRef.current = data
  eventRef.current = event

  const applyPosition = useCallback((position: Position, notifyRotate = false) => {
    positionRef.current = position

    if (dragBlockRef.current) {
      dragBlockRef.current.style.transform = `translate3d(${position.dragLeft}px, 0, 0)`
    }
    if (thumbBlockRef.current) {
      thumbBlockRef.current.style.transform = `rotate(${position.thumbAngle}deg)`
    }
    if (notifyRotate) {
      eventRef.current.rotate && eventRef.current.rotate(position.thumbAngle)
    }
  }, [dragBlockRef, thumbBlockRef])

  const flushAnimationFrame = useCallback((notifyRotate = true) => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }

    const position = pendingPositionRef.current
    pendingPositionRef.current = null
    if (position) {
      applyPosition(position, notifyRotate)
    }
  }, [applyPosition])

  const schedulePosition = useCallback((position: Position) => {
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
    const dragBlock = dragBlockRef.current
    dragGeometryRef.current = null
    hasMovedRef.current = false
    if (geometry && dragBlock && dragBlock.hasPointerCapture && dragBlock.hasPointerCapture(geometry.pointerId)) {
      dragBlock.releasePointerCapture(geometry.pointerId)
    }
    pendingPositionRef.current = null
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
  }, [dragBlockRef])

  const resetData = useCallback(() => {
    clearActiveDrag()
    applyPosition({dragLeft: 0, thumbAngle: dataRef.current.angle || 0})
  }, [applyPosition, clearActiveDrag])

  useEffect(() => {
    resetData()
  }, [data.angle, data.image, data.thumb, resetData])

  useEffect(() => () => {
    clearActiveDrag()
  }, [clearActiveDrag])

  const dragEvent = useCallback((e: any) => {
    if (e.button !== undefined && e.button !== 0) {
      return
    }
    if (!dragBarRef.current || !dragBlockRef.current || !thumbBlockRef.current) {
      return
    }

    clearActiveDrag()

    const startPosition = positionRef.current
    const maxDragLeft = Math.max(0, dragBarRef.current.offsetWidth - dragBlockRef.current.offsetWidth)
    const availableDragDistance = maxDragLeft - startPosition.dragLeft

    dragGeometryRef.current = {
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startPosition,
      maxDragLeft,
      thumbRatio: availableDragDistance > 0 ? (360 - startPosition.thumbAngle) / availableDragDistance : 0,
    }
    hasMovedRef.current = false

    dragBlockRef.current.setPointerCapture && dragBlockRef.current.setPointerCapture(e.pointerId)
    e.preventDefault()
  }, [clearActiveDrag, dragBarRef, dragBlockRef, thumbBlockRef])

  const getPositionFromPointerEvent = useCallback((e: PointerEvent): Position | null => {
    const geometry = dragGeometryRef.current
    if (!geometry || geometry.pointerId !== e.pointerId) {
      return null
    }

    const dragLeft = clamp(
      geometry.startPosition.dragLeft + e.clientX - geometry.startClientX,
      0,
      geometry.maxDragLeft,
    )
    const thumbAngle = clamp(
      geometry.startPosition.thumbAngle + (dragLeft - geometry.startPosition.dragLeft) * geometry.thumbRatio,
      dataRef.current.angle || 0,
      360,
    )

    return {dragLeft, thumbAngle}
  }, [])

  const moveEvent = useCallback((e: PointerEvent) => {
    const position = getPositionFromPointerEvent(e)
    if (!position) {
      return
    }

    if (position.dragLeft !== positionRef.current.dragLeft) {
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
      if (position.dragLeft !== positionRef.current.dragLeft) {
        hasMovedRef.current = true
      }
      schedulePosition(position)
    }
    flushAnimationFrame(hasMovedRef.current)
    const angle = positionRef.current.thumbAngle
    const hasMoved = hasMovedRef.current
    clearActiveDrag()

    if (!hasMoved) {
      return
    }

    eventRef.current.confirm && eventRef.current.confirm(Math.trunc(angle), resetData)
    e.preventDefault()
  }, [clearActiveDrag, flushAnimationFrame, getPositionFromPointerEvent, resetData, schedulePosition])

  const cancelEvent = useCallback((e: PointerEvent) => {
    const geometry = dragGeometryRef.current
    if (geometry && geometry.pointerId === e.pointerId) {
      clearActiveDrag()
    }
  }, [clearActiveDrag])

  useEffect(() => {
    const dragBlock = dragBlockRef.current
    if (!dragBlock) {
      return
    }

    dragBlock.addEventListener('pointermove', moveEvent)
    dragBlock.addEventListener('pointerup', upEvent)
    dragBlock.addEventListener('pointercancel', cancelEvent)
    dragBlock.addEventListener('lostpointercapture', cancelEvent)

    return () => {
      dragBlock.removeEventListener('pointermove', moveEvent)
      dragBlock.removeEventListener('pointerup', upEvent)
      dragBlock.removeEventListener('pointercancel', cancelEvent)
      dragBlock.removeEventListener('lostpointercapture', cancelEvent)
    }
  }, [cancelEvent, dragBlockRef, moveEvent, upEvent])

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

  const getState = useCallback(() => positionRef.current, [])

  return {
    getState,
    dragEvent,
    closeEvent,
    refreshEvent,
    resetData,
    clearData,
    close,
    refresh,
  }
}
