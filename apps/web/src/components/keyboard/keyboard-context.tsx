import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

interface KeyboardContextValue {
  visible: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

const KeyboardContext = createContext<KeyboardContextValue | null>(null);

export function KeyboardProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const open = useCallback(() => setVisible(true), []);
  const close = useCallback(() => setVisible(false), []);
  const toggle = useCallback(() => setVisible((v) => !v), []);

  const value = useMemo(
    () => ({ visible, open, close, toggle }),
    [visible, open, close, toggle],
  );

  return (
    <KeyboardContext.Provider value={value}>
      {children}
    </KeyboardContext.Provider>
  );
}

export function useKeyboard() {
  const ctx = useContext(KeyboardContext);
  if (!ctx) throw new Error('useKeyboard debe usarse dentro de KeyboardProvider');
  return ctx;
}
