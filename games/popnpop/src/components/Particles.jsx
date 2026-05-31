import { motion } from 'framer-motion';
import { PARTICLE_PALETTE } from '../constants';

// 풍선이 팡! 터질 때 사방으로 퍼지는 파티클.
const PIECES = Array.from({ length: 12 }, (_, i) => {
  const angle = (i / 12) * Math.PI * 2;
  const distance = 70 + Math.random() * 30;
  return {
    dx: Math.cos(angle) * distance,
    dy: Math.sin(angle) * distance,
    color: PARTICLE_PALETTE[i % PARTICLE_PALETTE.length],
    size: 10 + Math.random() * 8,
  };
});

const Particles = () => (
  <div className="relative w-0 h-0 pointer-events-none">
    {/* 중앙 빛망울 */}
    <motion.span
      className="absolute rounded-full bg-white"
      style={{ width: 60, height: 60, left: -30, top: -30 }}
      initial={{ opacity: 0.9, scale: 0.2 }}
      animate={{ opacity: 0, scale: 1.8 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
    />
    {PIECES.map((p, i) => (
      <motion.span
        key={i}
        className="absolute rounded-full"
        style={{
          width: p.size,
          height: p.size,
          backgroundColor: p.color,
          left: -p.size / 2,
          top: -p.size / 2,
        }}
        initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
        animate={{ x: p.dx, y: p.dy, opacity: 0, scale: 0.3 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      />
    ))}
  </div>
);

export default Particles;
