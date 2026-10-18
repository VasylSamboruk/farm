import { authApi } from '../api/auth.api';
import { useAuthStore } from '../store/authStore';
import { useImpersonationStore } from '../store/impersonationStore';

// Адмін входить у гру від імені гравця: ферма, склад і баланс стають його, але права лишаються адмінськими.
export const startImpersonation = async (targetId: string, targetName: string) => {
  const auth = useAuthStore.getState();
  const imp = useImpersonationStore.getState();
  const adminUser = imp.adminUser ?? auth.user;
  if (!adminUser || adminUser.role !== 'admin') throw new Error('Потрібні права адміністратора.');
  if (targetId === adminUser.id) {
    stopImpersonation();
    return;
  }
  useImpersonationStore.getState().begin(adminUser, targetId, targetName);
  try {
    const target = await authApi.getCurrentUser();
    if (String(target.id) !== targetId) throw new Error('Не вдалося зайти на ферму цього гравця.');
    useImpersonationStore.getState().begin(adminUser, targetId, target.username);
    useAuthStore.setState({ user: { ...target, role: 'admin' } });
  } catch (error) {
    useImpersonationStore.getState().end();
    throw error;
  }
};

export const stopImpersonation = () => {
  const { adminUser, end } = useImpersonationStore.getState();
  end();
  if (adminUser) useAuthStore.getState().setUser(adminUser);
};
