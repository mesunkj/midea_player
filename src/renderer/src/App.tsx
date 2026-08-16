import React, { useState } from 'react';
import ConfigView from './views/ConfigView';
import PlaybackView from './views/PlaybackView';

function App() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [directories, setDirectories] = useState<string[]>([]);
  const [layout, setLayout] = useState<string>('random');
  const [interval, setIntervalTime] = useState<number>(3); // 預設 3 秒
  const [order, setOrder] = useState<string>('shuffle'); // 預設打散
  const [recursive, setRecursive] = useState<boolean>(false);
  const [transition, setTransition] = useState<string>('fade');

  const handleStart = (selectedDirs: string[], selectedLayout: string, selectedInterval: number, selectedOrder: string, selectedRecursive: boolean, selectedTransition: string) => {
    setDirectories(selectedDirs);
    setLayout(selectedLayout);
    setIntervalTime(selectedInterval);
    setOrder(selectedOrder);
    setRecursive(selectedRecursive);
    setTransition(selectedTransition);
    setIsPlaying(true);
  };

  return (
    <div style={{ width: '100vw', height: '100vh', margin: 0, padding: 0 }}>
      {isPlaying ? (
        <PlaybackView 
          directories={directories} 
          layout={layout} 
          intervalTime={interval}
          order={order}
          recursive={recursive}
          transition={transition}
          onExit={() => setIsPlaying(false)} 
        />
      ) : (
        <ConfigView 
          initialDirectories={directories}
          initialLayout={layout}
          initialInterval={interval}
          initialOrder={order}
          initialRecursive={recursive}
          initialTransition={transition}
          onStart={handleStart} 
        />
      )}
    </div>
  );
}

export default App;
