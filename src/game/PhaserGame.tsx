import { useEffect, useRef } from 'react'
import Phaser from 'phaser'
import { MapScene, MAP_WIDTH, MAP_HEIGHT } from './MapScene'

export function PhaserGame() {
  const containerRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<Phaser.Game | undefined>(undefined)

  useEffect(() => {
    if (!containerRef.current || gameRef.current) return

    gameRef.current = new Phaser.Game({
      type: Phaser.AUTO,
      width: MAP_WIDTH,
      height: MAP_HEIGHT,
      parent: containerRef.current,
      backgroundColor: '#0f172a',
      scene: [MapScene],
    })

    return () => {
      gameRef.current?.destroy(true)
      gameRef.current = undefined
    }
  }, [])

  return <div ref={containerRef} />
}
