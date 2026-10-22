import { SearchControls } from '../components/search-controls.js';
import { searchRoute } from '../routes.js';

export default function SearchPage() {
  return <SearchControls />;
}

export const getConfig = async () => {
  return {
    render: 'dynamic',
    unstable_searchCodec: searchRoute.searchCodec,
  } as const;
};
