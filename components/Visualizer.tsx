
import React, { useEffect, useRef } from 'react';

interface VisualizerProps {
  isActive: boolean;
  color?: string;
}

export const Visualizer: React.FC<VisualizerProps> = ({ isActive, color = '#60a5fa' }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let frames = 0;

    const render = () => {
      frames++;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const radius = 60;
      
      // Draw outer glowing rings
      for (let i = 1; i <= 3; i++) {
        const opacity = isActive ? 0.2 / i : 0.05 / i;
        ctx.beginPath();
        const r = radius + i * 20 + (isActive ? Math.sin(frames * 0.1) * 5 : 0);
        ctx.arc(centerX, centerY, r, 0, Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.globalAlpha = opacity;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Draw center core
      ctx.beginPath();
      const coreRadius = radius + (isActive ? Math.sin(frames * 0.15) * 8 : 0);
      const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, coreRadius);
      gradient.addColorStop(0, color);
      gradient.addColorStop(1, 'transparent');
      ctx.fillStyle = gradient;
      ctx.globalAlpha = isActive ? 0.6 : 0.1;
      ctx.arc(centerX, centerY, coreRadius, 0, Math.PI * 2);
      ctx.fill();

      // Dynamic frequency-like particles if active
      if (isActive) {
        for (let i = 0; i < 8; i++) {
          const angle = (i / 8) * Math.PI * 2 + (frames * 0.02);
          const dist = radius + 30 + Math.random() * 20;
          const px = centerX + Math.cos(angle) * dist;
          const py = centerY + Math.sin(angle) * dist;
          ctx.beginPath();
          ctx.arc(px, py, 2, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.globalAlpha = 0.4;
          ctx.fill();
        }
      }

      animationId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animationId);
  }, [isActive, color]);

  return (
    <canvas 
      ref={canvasRef} 
      width={400} 
      height={400} 
      className="w-full max-w-[400px] h-auto pointer-events-none"
    />
  );
};
