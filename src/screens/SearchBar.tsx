import { useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { SearchEntry, SearchIndex } from '../overlays/searchTypes';
import { searchIndex } from '../search/searchQuery';

interface SearchBarProps {
  index: SearchIndex;
  /** True when the index is bundled placeholder data, not a real pipeline export. */
  isSample: boolean;
  onSelect: (entry: SearchEntry) => void;
}

const KIND_LABEL: Record<SearchEntry['kind'], string> = {
  place: 'Place',
  road: 'Road',
  poi: 'POI',
};

/**
 * Offline search bar (spec §16): place/road/POI name search over a local
 * index, no live lookups. Only ever surfaces publicly known/named things —
 * private roads and undocumented structures never carry a `name` (spec §6),
 * so filtering happens structurally, not as an extra check here.
 */
export function SearchBar({ index, isSample, onSelect }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);

  const results = useMemo(() => searchIndex(index, query), [index, query]);
  const showResults = focused && query.trim().length > 0;

  const handleSelect = (entry: SearchEntry) => {
    setQuery(entry.name);
    setFocused(false);
    onSelect(entry);
  };

  return (
    <View style={styles.wrapper}>
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          onFocus={() => setFocused(true)}
          placeholder="Search Sonoma County…"
          placeholderTextColor="#a39a89"
          returnKeyType="search"
        />
        {query.length > 0 && (
          <Pressable
            onPress={() => {
              setQuery('');
              setFocused(false);
            }}
            hitSlop={8}
            accessibilityLabel="Clear search"
          >
            <Text style={styles.clear}>×</Text>
          </Pressable>
        )}
      </View>

      {showResults && (
        <View style={styles.results}>
          {results.length === 0 ? (
            <Text style={styles.empty}>No matches</Text>
          ) : (
            <FlatList
              data={results}
              keyExtractor={(entry) => entry.id}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <Pressable style={styles.resultRow} onPress={() => handleSelect(item)}>
                  <Text style={styles.resultName}>{item.name}</Text>
                  <Text style={styles.resultKind}>{KIND_LABEL[item.kind]}</Text>
                </Pressable>
              )}
            />
          )}
          {isSample && <Text style={styles.sampleNote}>Sample data — pipeline output not installed</Text>}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    top: 16,
    left: 12,
    right: 12,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: '#3d3a34',
  },
  clear: {
    fontSize: 20,
    color: '#8a7a66',
    paddingHorizontal: 4,
  },
  results: {
    marginTop: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.97)',
    borderRadius: 10,
    maxHeight: 260,
    paddingVertical: 4,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  resultName: {
    fontSize: 14,
    color: '#3d3a34',
    fontWeight: '600',
  },
  resultKind: {
    fontSize: 11,
    color: '#8a7a66',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  empty: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 13,
    color: '#8a7a66',
  },
  sampleNote: {
    paddingHorizontal: 14,
    paddingTop: 2,
    paddingBottom: 8,
    fontSize: 10,
    color: '#b5541c',
    fontStyle: 'italic',
  },
});
