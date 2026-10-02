import { createContext, useContext } from 'react';

export type AdminToastKind = 'success' | 'error';
export type AdminToast = { kind: AdminToastKind; message: string };

export const AdminToastContext = createContext<(kind: AdminToastKind, message: string) => void>(() => {});
export const useAdminToast = () => useContext(AdminToastContext);