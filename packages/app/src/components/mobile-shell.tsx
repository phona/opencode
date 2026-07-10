import { createContext, useContext, type ParentProps } from "solid-js"

export type MobileShellApi = {
  openHome: () => void
  closeHome: () => void
  openChanges: () => void
  closeChanges: () => void
  isHomeOpen: () => boolean
  isChangesOpen: () => boolean
}

const MobileShellContext = createContext<MobileShellApi | undefined>(undefined)

export const useMobileShell = () => {
  const ctx = useContext(MobileShellContext)
  if (!ctx) throw new Error("useMobileShell must be used inside MobileShell")
  return ctx
}

export function MobileShellProvider(props: ParentProps<{ value: MobileShellApi }>) {
  return (
    <MobileShellContext.Provider value={props.value}>
      {props.children}
    </MobileShellContext.Provider>
  )
}
