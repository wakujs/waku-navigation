import { UserParams } from '../../components/user-params.js';

export default function UserPage({ id }: { id: string }) {
  return (
    <>
      <h1 data-testid="user-heading">User: {id}</h1>
      <UserParams />
    </>
  );
}

export const getConfig = async () => {
  return {
    render: 'dynamic',
  } as const;
};
