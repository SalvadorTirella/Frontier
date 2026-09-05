// @ts-nocheck
import { useEffect, useRef } from 'react';
import { boot } from './js/ui/UIManager.js';

export default function App() {
  const stageRef = useRef(null);

  useEffect(() => {
    const game = boot(stageRef.current);
    return () => {
      if (game) game.destroy();
    };
  }, []);

  return (
    <div id="viewport">
      <div id="app-stage" ref={stageRef}>
        <canvas id="render-canvas" width={720} height={1280} />
        <div id="ui-layer" />
        <div id="vignette" />
      </div>
    </div>
  );
}
