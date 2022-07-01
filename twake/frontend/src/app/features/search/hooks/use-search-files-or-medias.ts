import { delayRequest } from 'app/features/global/utils/managedSearchRequest';
import { useEffect } from 'react';
import { useRecoilState, useRecoilValue } from 'recoil';
import { SearchInputState } from '../state/search-input';
import MessagesAPIClient from 'app/features/messages/api/message-api-client';
import { SearchFilesResultsState } from '../state/search-files-result';
import { LoadingState } from 'app/features/global/state/atoms/Loading';
import { RecentFilesState } from '../state/recent-files';
import { RecentMediasState } from '../state/recent-medias';
import { SearchMediasResultsState } from '../state/search-medias-result';
import _ from 'lodash';
import { useGlobalEffect } from 'app/features/global/hooks/use-global-effect';
import useRouterCompany from 'app/features/router/hooks/use-router-company';

export const useSearchMessagesFilesLoading = () => {
  return useRecoilValue(LoadingState('useSearchMessagesFilesOrMedias-' + 'files'));
};

export const useSearchMessagesMediasLoading = () => {
  return useRecoilValue(LoadingState('useSearchMessagesFilesOrMedias-' + 'medias'));
};

let currentQuery = '';

export const useSearchMessagesFilesOrMedias = (mode: 'files' | 'medias') => {
  const companyId = useRouterCompany();
  const searchInput = useRecoilValue(SearchInputState);
  const [loading, setLoading] = useRecoilState(
    LoadingState('useSearchMessagesFilesOrMedias-' + mode),
  );

  const [searched, setSearched] = useRecoilState(
    mode === 'files' ? SearchFilesResultsState(companyId) : SearchMediasResultsState(companyId),
  );
  const [recent, setRecent] = useRecoilState(
    mode === 'files' ? RecentFilesState(companyId) : RecentMediasState(companyId),
  );

  const opt = _.omitBy(
    {
      limit: 100,
      is_file: mode === 'files' || undefined,
      is_media: mode === 'medias' || undefined,
      workspace_id: searchInput.workspaceId,
      channel_id: searchInput.channelId,
    },
    _.isUndefined,
  );

  const refresh = async () => {
    setLoading(true);
    const isRecent = !searchInput.query;

    const query = searchInput.query;
    currentQuery = query;

    const response = await MessagesAPIClient.searchFile(searchInput.query || null, opt);
    let results = response.resources || [];
    if (isRecent)
      results = results.sort(
        (a, b) => (b?.message?.created_at || 0) - (a?.message?.created_at || 0),
      );

    const update = {
      results,
      nextPage: response.next_page_token,
    };

    if (currentQuery !== query) {
      return;
    }

    if (!isRecent) setSearched(update);
    if (isRecent) setRecent(update);
    setLoading(false);
  };

  const loadMore = async () => {
    //Not implemented
    console.error('Not implemented');
  };

  useGlobalEffect(
    'useSearchFiles' + mode,
    () => {
      (async () => {
        setLoading(true);
        if (searchInput) {
          delayRequest('useSearchFiles' + mode, async () => {
            await refresh();
          });
        } else {
          refresh();
        }
      })();
    },
    [searchInput.query, searchInput.channelId, searchInput.workspaceId],
  );

  return {
    loading,
    files: searchInput?.query ? searched.results : recent.results,
    loadMore,
    refresh,
  };
};

export const useSearchMessagesMedias = () => {
  return useSearchMessagesFilesOrMedias('medias');
};

export const useSearchMessagesFiles = () => {
  return useSearchMessagesFilesOrMedias('files');
};