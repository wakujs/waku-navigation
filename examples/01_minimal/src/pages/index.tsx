export default function HomePage() {
  return <h1>Welcome to the Home Page</h1>;
}

export const getConfig = async () => {
  return {
    render: 'static',
  } as const;
};
