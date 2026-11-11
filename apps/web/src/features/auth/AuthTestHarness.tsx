import { MemoryRouter } from 'react-router';
import AuthApp from './AuthApp';

export function AuthTestHarness() {
  return (
    <MemoryRouter initialEntries={['/workspace']}>
      <AuthApp />
    </MemoryRouter>
  );
}
