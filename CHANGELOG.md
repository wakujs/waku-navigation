# Change Log

## [Unreleased]

### Added

- `unstable_useNavigationStatus`: a `useFormStatus`-style hook reporting whether a navigation initiated by the enclosing `<a>` is in flight (counterpart of waku's `useNavigationStatus_UNSTABLE`, with a `ref` to locate the anchor)

### Changed

- Route changes now always run in a React transition (previously only when a `<Pending>` matched)
- A click on an unwrapped `<a>` no longer lights up a `<Pending>` that merely shares the destination href

### Changed

- update waku v1.0.0-beta.3 #2

## [0.0.2] - 2026-05-25

### Added

- Test release (with wip features)

## [0.0.1] - 2026-01-11

### Added

- Experimental release (Not all features are implemented yet)
