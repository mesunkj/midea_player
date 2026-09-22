import React, { useState } from 'react';
import ConfigView    from './views/ConfigView';
import ScanView      from './views/ScanView';
import PlaybackView  from './views/PlaybackView';
import AnnotationView from './views/AnnotationView';

type AppView = 'config' | 'scan' | 'play' | 'annotate';

interface PlaySettings {
  directories:   string[];
  layout:        string;
  interval:      number;
  order:         string;
  recursive:     boolean;
  transition:    string;
  subDirKeyword: string;
  dbRootDir:     string;
}

function App() {
  const [view, setView] = useState<AppView>('config');
  const [settings, setSettings] = useState<PlaySettings>({
    directories:   [],
    layout:        'random',
    interval:      3,
    order:         'shuffle',
    recursive:     false,
    transition:    'fade',
    subDirKeyword: '',
    dbRootDir:     '',
  });

  const applySettings = (
    directories: string[], layout: string, interval: number,
    order: string, recursive: boolean, transition: string,
    subDirKeyword: string, dbRootDir: string
  ): PlaySettings => {
    const next: PlaySettings = {
      directories, layout, interval, order, recursive, transition, subDirKeyword, dbRootDir,
    };
    setSettings(next);
    return next;
  };

  const handleGoScan = (
    directories: string[], layout: string, interval: number,
    order: string, recursive: boolean, transition: string,
    subDirKeyword: string, dbRootDir: string
  ) => {
    applySettings(directories, layout, interval, order, recursive, transition, subDirKeyword, dbRootDir);
    setView('scan');
  };

  const handlePlayDirect = (
    directories: string[], layout: string, interval: number,
    order: string, recursive: boolean, transition: string,
    subDirKeyword: string, dbRootDir: string
  ) => {
    applySettings(directories, layout, interval, order, recursive, transition, subDirKeyword, dbRootDir);
    setView('play');
  };

  const handleGoAnnotate = (
    directories: string[], layout: string, interval: number,
    order: string, recursive: boolean, transition: string,
    subDirKeyword: string, dbRootDir: string
  ) => {
    applySettings(directories, layout, interval, order, recursive, transition, subDirKeyword, dbRootDir);
    setView('annotate');
  };

  const { directories, layout, interval, order, recursive, transition, subDirKeyword, dbRootDir } = settings;

  return (
    <div style={{ width: '100vw', height: '100vh', margin: 0, padding: 0, overflow: 'hidden' }}>

      {view === 'config' && (
        <ConfigView
          initialDirectories={directories}
          initialLayout={layout}
          initialInterval={interval}
          initialOrder={order}
          initialRecursive={recursive}
          initialTransition={transition}
          initialSubDirKeyword={subDirKeyword}
          initialDbRootDir={dbRootDir}
          onScan={handleGoScan}
          onPlayDirect={handlePlayDirect}
          onAnnotate={handleGoAnnotate}
        />
      )}

      {view === 'scan' && (
        <ScanView
          directories={directories}
          recursive={recursive}
          subDirKeyword={subDirKeyword}
          dbRootDir={dbRootDir}
          onProceed={() => setView('play')}
          onAnnotate={() => setView('annotate')}
          onSkip={()    => setView('play')}
          onBack={()    => setView('config')}
        />
      )}

      {view === 'play' && (
        <PlaybackView
          directories={directories}
          layout={layout}
          intervalTime={interval}
          order={order}
          recursive={recursive}
          transition={transition}
          subDirKeyword={subDirKeyword}
          dbRootDir={dbRootDir}
          onAnnotate={() => setView('annotate')}
          onExit={() => setView('config')}
        />
      )}

      {view === 'annotate' && (
        <AnnotationView
          directories={directories}
          dbRootDir={dbRootDir}
          onBack={() => setView('play')}
          onDone={() => setView('play')}
        />
      )}

    </div>
  );
}

export default App;
