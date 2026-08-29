import GameCanvas from '../components/GameCanvas';
import Hud from '../components/hud/Hud';
import DeathScreen from '../components/hud/DeathScreen';
import Pane from '../components/pane/Pane';

export default function Home() {
  return (
    <main className="relative h-full overflow-hidden">
      <div className="absolute inset-0">
        <GameCanvas />
      </div>
      <div className="pointer-events-none absolute inset-0 z-10">
        <Hud />
        <Pane />
        <DeathScreen />
      </div>
    </main>
  );
}
