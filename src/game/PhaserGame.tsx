import { useEffect, useRef } from 'react'
import Phaser from 'phaser'
import { MapScene } from './MapScene'

export function PhaserGame() {
  const containerRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<Phaser.Game | undefined>(undefined)

  useEffect(() => {
    const parent = containerRef.current
    if (!parent || gameRef.current) return

    // Render at device resolution and scale the canvas back down with CSS:
    // Phaser sizes the buffer in CSS pixels, which leaves hairlines blurry on
    // retina screens.
    const ratio = Math.min(window.devicePixelRatio || 1, 2)

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent,
      backgroundColor: '#ffffff',
      scale: {
        mode: Phaser.Scale.NONE,
        width: Math.max(parent.clientWidth, 1) * ratio,
        height: Math.max(parent.clientHeight, 1) * ratio,
      },
      scene: [MapScene],
    })
    gameRef.current = game

    const applySize = () => {
      const width = parent.clientWidth
      const height = parent.clientHeight
      if (!width || !height) return

      game.scale.resize(width * ratio, height * ratio)
      game.canvas.style.width = `${width}px`
      game.canvas.style.height = `${height}px`
    }

    applySize()
    const observer = new ResizeObserver(applySize)
    observer.observe(parent)

    return () => {
      observer.disconnect()
      game.destroy(true)
      gameRef.current = undefined
    }
  }, [])

  return <div ref={containerRef} className="map-canvas" />
}
