/*
 * SPDX-License-Identifier: Apache-2.0
 *
 * The OpenSearch Contributors require contributions made to
 * this file be licensed under the Apache-2.0 license or a
 * compatible open source license.
 *
 * Any modifications Copyright OpenSearch Contributors. See
 * GitHub history for details.
 */

/*
 * Licensed to Elasticsearch B.V. under one or more contributor
 * license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright
 * ownership. Elasticsearch B.V. licenses this file to you under
 * the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { EuiIcon } from '@elastic/eui';
import classNames from 'classnames';
import React from 'react';
import { QuerySuggestion } from '../../autocomplete';

function getEuiIconType(type: string) {
  switch (type) {
    case 'field':
      return 'kqlField';
    case 'value':
      return 'kqlValue';
    case 'recentSearch':
      return 'search';
    case 'conjunction':
      return 'kqlSelector';
    case 'operator':
      return 'kqlOperand';
    default:
      throw new Error(`Unknown type: ${type}`);
  }
}

interface Props {
  onClick: (suggestion: QuerySuggestion) => void;
  onMouseEnter: () => void;
  selected: boolean;
  suggestion: QuerySuggestion;
  innerRef: (node: HTMLDivElement) => void;
  ariaId: string;
  shouldDisplayDescription: boolean;
}

export function SuggestionComponent(props: Props) {
  // Removing empty suggestions from the history is for maintaining a clean user experience.
  // Empty suggestions, which typically result from inadvertent keystrokes or incomplete queries,
  // do not provide value to the user.
  if (!props.suggestion.text.trim()) {
    return null;
  }

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/interactive-supports-focus
    <div
      className={classNames({
        // eslint-disable-next-line @typescript-eslint/naming-convention
        osdTypeahead__item: true,
        active: props.selected,
      })}
      role="option"
      onClick={() => props.onClick(props.suggestion)}
      onMouseEnter={props.onMouseEnter}
      ref={props.innerRef}
      id={props.ariaId}
      aria-selected={props.selected}
      data-test-subj={`autocompleteSuggestion-${
        props.suggestion.type
      }-${props.suggestion.text.replace(/\s/g, '-')}`}
    >
      <div className={'osdSuggestionItem osdSuggestionItem--' + props.suggestion.type}>
        <div className="osdSuggestionItem__type" data-test-subj="osdSuggestionType">
          {/* @ts-expect-error TS2345 TODO(ts-error): fixme */}
          <EuiIcon type={getEuiIconType(props.suggestion.type)} />
        </div>
        <div className="osdSuggestionItem__text" data-test-subj="autoCompleteSuggestionText">
          {props.suggestion.text}
        </div>
        {props.shouldDisplayDescription && (
          <div className="osdSuggestionItem__description" data-test-subj="osdSuggestionDescription">
            {props.suggestion.description}
          </div>
        )}
      </div>
    </div>
  );
}
