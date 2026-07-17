import { SearchControls } from '../components/search-controls.js';
import { tabCodec } from '../search-codecs.js';

export default function SearchPage() {
  return <SearchControls />;
}

export const getConfig = async () => {
  return {
    render: 'dynamic',
    unstable_searchCodec: tabCodec,
  } as const;
};
