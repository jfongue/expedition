import { useEffect, useRef } from 'react'
import Phaser from 'phaser'
import { MapScene } from './MapScene'

export function PhaserGame() {
  const containerRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<Phaser.Game | undefined>(undefined)

  useEffect(() => {
    const parent = containerRef.current
    if (!parent || gameRef.current) return

    // Render at device resolution, display at CSS resolution: sizing the buffer
    // in CSS pixels leaves hairlines blurry on retina screens. `zoom` is how
    // that is expressed to Phaser — styling the canvas by hand instead would
    // leave the scale manager unaware of the real display size, and every
    // pointer coordinate reaching the scene would be off by the same factor.
    const ratio = Math.min(window.devicePixelRatio || 1, 2)

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent,
      backgroundColor: '#ffffff',
      scale: {
        mode: Phaser.Scale.NONE,
        zoom: 1 / ratio,
        width: Math.max(parent.clientWidth, 1) * ratio,
        height: Math.max(parent.clientHeight, 1) * ratio,
      },
      scene: [MapScene],
    })
    gameRef.current = game

    // A handle on the running game while developing: lets the console (and the
    // browser-driven checks) inspect the camera and the scene's current view.
    if (import.meta.env.DEV) {
      ;(window as unknown as { expeditionGame?: Phaser.Game }).expeditionGame = game
    }

    const applySize = () => {
      const width = parent.clientWidth
      const height = parent.clientHeight
      if (!width || !height) return

      game.scale.resize(width * ratio, height * ratio)
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
