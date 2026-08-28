import GameCanvas from '../components/GameCanvas';
import Pane from '../components/pane/Pane';

export default function Home() {
  return (
    <main className="grid h-full grid-cols-[minmax(0,1fr)_minmax(20rem,28rem)] place-items-stretch">
      <GameCanvas />
      <Pane />
    </main>
  );
}
