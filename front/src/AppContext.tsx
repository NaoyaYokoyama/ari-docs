import {
  createContext,
  useContext,
} from "react";

export type LoginUser = {
  userId: string;
  displayName: string;
  mode: string;
};

type AppContextType = {
  user: LoginUser | null;
  setUser: React.Dispatch<React.SetStateAction<LoginUser | null>>;
};

export const AppContext = createContext<AppContextType | null>(null);

export function useApp() {
  const context = useContext(AppContext);

  if (!context) {
    throw new Error("AppContext is not available");
  }

  return context;
}
