import { createContext, useContext, type ParentProps } from "solid-js"

export type MobileShellApi = {
  openHome: () => void
  closeHome: () => void
  openChanges: () => void
  closeChanges: () => void
  isHomeOpen: () => boolean
  isChangesOpen: () => boolean
}

export const MobileShellContext = createContext<MobileShellApi | undefined>(undefined)

export const useMobileShell = () => {
  return useContext(MobileShellContext)
}

export function MobileShellProvider(props: ParentProps<{ value: MobileShellApi }>) {
  return (
    <MobileShellContext.Provider value={props.value}>
      {props.children}
    </MobileShellContext.Provider>
  )
}
