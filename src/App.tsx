// @ts-nocheck
import { useEffect, useRef } from 'react';
import { boot } from './js/ui/UIManager.js';

const PHONE_SVG = (
  <svg viewBox="0 0 64 64" width="72" height="72" fill="none" stroke="#00C6FF" strokeWidth="2.4">
    <rect x="20" y="8" width="24" height="48" rx="4" />
    <path d="M28 50h8" strokeLinecap="round" />
    <path d="M52 22c4 4 4 16 0 20M12 22c-4 4-4 16 0 20" strokeLinecap="round" opacity=".55" />
  </svg>
);

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
        <canvas id="render-canvas" width={1280} height={720} />
        <div id="ui-layer" />
        <div id="vignette" />
      </div>
      <div id="rotate-overlay">
        <div className="rotate-phone">{PHONE_SVG}</div>
        <div className="rotate-title">ROTATE DEVICE</div>
        <div className="rotate-sub">TACTICAL ARMY BATTLE REQUIRES LANDSCAPE ORIENTATION</div>
      </div>
    </div>
  );
}
