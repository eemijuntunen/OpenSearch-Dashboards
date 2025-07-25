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

import React from 'react';
import { i18n } from '@osd/i18n';

import { TopNavMenuData } from 'src/plugins/navigation/public';
import { AppMountParameters } from 'opensearch-dashboards/public';
import { VISUALIZE_EMBEDDABLE_TYPE, VisualizeInput } from '../../../../visualizations/public';
import {
  showSaveModal,
  SavedObjectSaveModalOrigin,
  SavedObjectSaveOpts,
  OnSaveProps,
} from '../../../../saved_objects/public';
import { unhashUrl } from '../../../../opensearch_dashboards_utils/public';

import {
  VisualizeServices,
  VisualizeAppStateContainer,
  VisualizeEditorVisInstance,
} from '../types';
import { VisualizeConstants } from '../visualize_constants';
import { getEditBreadcrumbs } from './breadcrumbs';
import { EmbeddableStateTransfer } from '../../../../embeddable/public';
import { VisualizeTopNavIds } from './constants';

interface TopNavConfigParams {
  hasUnsavedChanges: boolean;
  setHasUnsavedChanges: (value: boolean) => void;
  openInspector: () => void;
  originatingApp?: string;
  setOriginatingApp?: (originatingApp: string | undefined) => void;
  hasUnappliedChanges: boolean;
  visInstance: VisualizeEditorVisInstance;
  stateContainer: VisualizeAppStateContainer;
  visualizationIdFromUrl?: string;
  stateTransfer: EmbeddableStateTransfer;
  embeddableId?: string;
  onAppLeave: AppMountParameters['onAppLeave'];
}

interface VisualizeNavActionMap {
  [key: string]: (anchorElement?: any) => void;
}

export const getLegacyTopNavConfig = (
  {
    hasUnsavedChanges,
    setHasUnsavedChanges,
    openInspector,
    originatingApp,
    setOriginatingApp,
    hasUnappliedChanges,
    visInstance,
    stateContainer,
    visualizationIdFromUrl,
    stateTransfer,
    embeddableId,
    onAppLeave,
  }: TopNavConfigParams,
  {
    application,
    chrome,
    history,
    share,
    setActiveUrl,
    toastNotifications,
    visualizeCapabilities,
    i18n: { Context: I18nContext },
    dashboard,
  }: VisualizeServices,
  navActions: VisualizeNavActionMap
) => {
  // @ts-expect-error TS6133 TODO(ts-error): fixme
  const { vis, embeddableHandler } = visInstance;
  const savedVis = 'savedVis' in visInstance ? visInstance.savedVis : undefined;

  const topNavMenu: TopNavMenuData[] = [
    {
      id: 'inspector',
      label: i18n.translate('visualize.topNavMenu.openInspectorButtonLabel', {
        defaultMessage: 'Inspect',
      }),
      description: i18n.translate('visualize.topNavMenu.openInspectorButtonAriaLabel', {
        defaultMessage: 'Open Inspector for visualization',
      }),
      testId: 'openInspectorButton',
      disableButton() {
        return !embeddableHandler.hasInspector || !embeddableHandler.hasInspector();
      },
      run: navActions[VisualizeTopNavIds.INSPECT],
      tooltip() {
        if (!embeddableHandler.hasInspector || !embeddableHandler.hasInspector()) {
          return i18n.translate('visualize.topNavMenu.openInspectorDisabledButtonTooltip', {
            defaultMessage: `This visualization doesn't support any inspectors.`,
          });
        }
      },
    },
    {
      id: 'share',
      label: i18n.translate('visualize.topNavMenu.shareVisualizationButtonLabel', {
        defaultMessage: 'Share',
      }),
      description: i18n.translate('visualize.topNavMenu.shareVisualizationButtonAriaLabel', {
        defaultMessage: 'Share Visualization',
      }),
      testId: 'shareTopNavButton',
      run: navActions[VisualizeTopNavIds.SHARE],
      // disable the Share button if no action specified
      disableButton: !share || !!embeddableId,
    },
    ...(originatingApp === 'dashboards' || originatingApp === 'canvas'
      ? [
          {
            id: 'cancel',
            label: i18n.translate('visualize.topNavMenu.cancelButtonLabel', {
              defaultMessage: 'Cancel',
            }),
            emphasize: false,
            description: i18n.translate('visualize.topNavMenu.cancelButtonAriaLabel', {
              defaultMessage: 'Return to the last app without saving changes',
            }),
            testId: 'visualizeCancelAndReturnButton',
            tooltip() {
              if (hasUnappliedChanges || hasUnsavedChanges) {
                return i18n.translate('visualize.topNavMenu.cancelAndReturnButtonTooltip', {
                  defaultMessage: 'Discard your changes before finishing',
                });
              }
            },
            run: navActions[VisualizeTopNavIds.CANCEL],
          },
        ]
      : []),
    ...(visualizeCapabilities.save && !embeddableId
      ? [
          {
            id: 'save',
            iconType: savedVis?.id && originatingApp ? undefined : ('save' as const),
            label:
              savedVis?.id && originatingApp
                ? i18n.translate('visualize.topNavMenu.saveVisualizationAsButtonLabel', {
                    defaultMessage: 'Save as',
                  })
                : i18n.translate('visualize.topNavMenu.saveVisualizationButtonLabel', {
                    defaultMessage: 'Save',
                  }),
            emphasize: (savedVis && !savedVis.id) || !originatingApp,
            description: i18n.translate('visualize.topNavMenu.saveVisualizationButtonAriaLabel', {
              defaultMessage: 'Save Visualization',
            }),
            className: savedVis?.id && originatingApp ? 'saveAsButton' : '',
            testId: 'visualizeSaveButton',
            disableButton: hasUnappliedChanges,
            tooltip() {
              if (hasUnappliedChanges) {
                return i18n.translate(
                  'visualize.topNavMenu.saveVisualizationDisabledButtonTooltip',
                  {
                    defaultMessage: 'Apply or Discard your changes before saving',
                  }
                );
              }
            },
            run: navActions[VisualizeTopNavIds.SAVE],
          },
        ]
      : []),
    ...(originatingApp && ((savedVis && savedVis.id) || embeddableId)
      ? [
          {
            id: 'saveAndReturn',
            label: i18n.translate('visualize.topNavMenu.saveAndReturnVisualizationButtonLabel', {
              defaultMessage: 'Save and return',
            }),
            emphasize: true,
            iconType: 'checkInCircleFilled' as const,
            description: i18n.translate(
              'visualize.topNavMenu.saveAndReturnVisualizationButtonAriaLabel',
              {
                defaultMessage: 'Finish editing visualization and return to the last app',
              }
            ),
            testId: 'visualizesaveAndReturnButton',
            disableButton: hasUnappliedChanges,
            tooltip() {
              if (hasUnappliedChanges) {
                return i18n.translate(
                  'visualize.topNavMenu.saveAndReturnVisualizationDisabledButtonTooltip',
                  {
                    defaultMessage: 'Apply or Discard your changes before finishing',
                  }
                );
              }
            },
            run: navActions[VisualizeTopNavIds.SAVEANDRETURN],
          },
        ]
      : []),
  ];

  return topNavMenu;
};

export const getNavActions = (
  {
    hasUnsavedChanges,
    setHasUnsavedChanges,
    openInspector,
    originatingApp,
    setOriginatingApp,
    hasUnappliedChanges,
    visInstance,
    stateContainer,
    visualizationIdFromUrl,
    stateTransfer,
    embeddableId,
    onAppLeave,
  }: TopNavConfigParams,
  {
    application,
    chrome,
    history,
    share,
    setActiveUrl,
    toastNotifications,
    visualizeCapabilities,
    i18n: { Context: I18nContext },
    dashboard,
  }: VisualizeServices
) => {
  const { vis, embeddableHandler } = visInstance;
  const savedVis = 'savedVis' in visInstance ? visInstance.savedVis : undefined;

  async function doSave(saveOptions: SavedObjectSaveOpts) {
    if (!savedVis) {
      return {};
    }
    const newlyCreated = !Boolean(savedVis.id) || savedVis.copyOnSave;
    // vis.title was not bound and it's needed to reflect title into visState
    stateContainer.transitions.setVis({
      title: savedVis.title,
    });
    savedVis.searchSourceFields = vis.data.searchSource?.getSerializedFields();
    savedVis.visState = stateContainer.getState().vis;
    savedVis.uiStateJSON = vis.uiState.toString();
    setHasUnsavedChanges(false);

    try {
      const id = await savedVis.save(saveOptions);

      if (id) {
        toastNotifications.addSuccess({
          title: i18n.translate('visualize.topNavMenu.saveVisualization.successNotificationText', {
            defaultMessage: `Saved '{visTitle}'`,
            values: {
              visTitle: savedVis.title,
            },
          }),
          'data-test-subj': 'saveVisualizationSuccess',
        });

        if (originatingApp && saveOptions.returnToOrigin) {
          const appPath = `${VisualizeConstants.EDIT_PATH}/${encodeURIComponent(id)}`;

          // Manually insert a new url so the back button will open the saved visualization.
          history.replace(appPath);
          setActiveUrl(appPath);

          if (newlyCreated && stateTransfer) {
            stateTransfer.navigateToWithEmbeddablePackage(originatingApp, {
              state: { type: VISUALIZE_EMBEDDABLE_TYPE, input: { savedObjectId: id } },
            });
          } else {
            application.navigateToApp(originatingApp);
          }
        } else {
          if (setOriginatingApp && originatingApp && newlyCreated) {
            setOriginatingApp(undefined);
          }
          chrome.docTitle.change(savedVis.lastSavedTitle);
          chrome.setBreadcrumbs(getEditBreadcrumbs(savedVis.lastSavedTitle));

          if (id !== visualizationIdFromUrl) {
            history.replace({
              ...history.location,
              pathname: `${VisualizeConstants.EDIT_PATH}/${id}`,
            });
          }
        }
      }

      return { id };
    } catch (error) {
      // eslint-disable-next-line
      console.error(error);
      toastNotifications.addDanger({
        title: i18n.translate('visualize.topNavMenu.saveVisualization.failureNotificationText', {
          defaultMessage: `Error on saving '{visTitle}'`,
          values: {
            visTitle: savedVis.title,
          },
        }),
        text: error.message,
        'data-test-subj': 'saveVisualizationError',
      });
      return { error };
    }
  }

  const createVisReference = () => {
    if (!originatingApp) {
      return;
    }
    const state = {
      input: {
        savedVis: vis.serialize(),
      } as VisualizeInput,
      embeddableId,
      type: VISUALIZE_EMBEDDABLE_TYPE,
    };
    stateTransfer.navigateToWithEmbeddablePackage(originatingApp, { state });
  };

  const navigateToOriginatingApp = () => {
    if (originatingApp) {
      application.navigateToApp(originatingApp);
    }
  };

  const navActions: VisualizeNavActionMap = {};

  const saveAction = (anchorElement: HTMLElement) => {
    const onSave = async ({
      newTitle,
      newCopyOnSave,
      isTitleDuplicateConfirmed,
      onTitleDuplicate,
      newDescription,
      returnToOrigin,
    }: OnSaveProps & { returnToOrigin: boolean }) => {
      if (!savedVis) {
        return;
      }
      const currentTitle = savedVis.title;
      savedVis.title = newTitle;
      embeddableHandler.updateInput({ title: newTitle });
      savedVis.copyOnSave = newCopyOnSave;
      savedVis.description = newDescription;
      const saveOptions = {
        confirmOverwrite: false,
        isTitleDuplicateConfirmed,
        onTitleDuplicate,
        returnToOrigin,
      };
      const response = await doSave(saveOptions);
      // If the save wasn't successful, put the original values back.
      if (!response.id || response.error) {
        savedVis.title = currentTitle;
      }
      return response;
    };

    const saveModal = (
      <SavedObjectSaveModalOrigin
        documentInfo={savedVis || { title: '' }}
        onSave={onSave}
        getAppNameFromId={stateTransfer.getAppNameFromId}
        objectType={'visualization'}
        onClose={() => {}}
        originatingApp={originatingApp}
      />
    );
    const isSaveAsButton = anchorElement.classList.contains('saveAsButton');
    onAppLeave((actions) => {
      return actions.default();
    });
    if (
      originatingApp === 'dashboards' &&
      dashboard.dashboardFeatureFlagConfig.allowByValueEmbeddables &&
      !isSaveAsButton
    ) {
      createVisReference();
    } else if (savedVis) {
      showSaveModal(saveModal, I18nContext);
    }
  };
  navActions[VisualizeTopNavIds.SAVE] = saveAction;

  const saveAndReturnAction = async () => {
    const saveOptions = {
      confirmOverwrite: false,
      returnToOrigin: true,
    };
    onAppLeave((actions) => {
      return actions.default();
    });
    if (
      originatingApp === 'dashboards' &&
      dashboard.dashboardFeatureFlagConfig.allowByValueEmbeddables &&
      !savedVis
    ) {
      return createVisReference();
    }
    return doSave(saveOptions);
  };
  navActions[VisualizeTopNavIds.SAVEANDRETURN] = saveAndReturnAction;

  const cancelAction = async () => {
    return navigateToOriginatingApp();
  };
  navActions[VisualizeTopNavIds.CANCEL] = cancelAction;

  const shareAction = (anchorElement: HTMLElement) => {
    if (share && !embeddableId) {
      // TODO: support sharing in by-value mode
      share.toggleShareContextMenu({
        anchorElement,
        allowEmbed: true,
        allowShortUrl: visualizeCapabilities.createShortUrl,
        shareableUrl: unhashUrl(window.location.href),
        objectId: savedVis?.id,
        objectType: 'visualization',
        sharingData: {
          title: savedVis?.title,
        },
        isDirty: hasUnappliedChanges || hasUnsavedChanges,
      });
    }
  };
  navActions[VisualizeTopNavIds.SHARE] = shareAction;

  navActions[VisualizeTopNavIds.INSPECT] = openInspector;

  return navActions;
};

export const getTopNavConfig = (
  {
    hasUnsavedChanges,
    setHasUnsavedChanges,
    openInspector,
    originatingApp,
    setOriginatingApp,
    hasUnappliedChanges,
    visInstance,
    stateContainer,
    visualizationIdFromUrl,
    stateTransfer,
    embeddableId,
    onAppLeave,
  }: TopNavConfigParams,
  {
    application,
    chrome,
    history,
    share,
    setActiveUrl,
    toastNotifications,
    visualizeCapabilities,
    i18n: { Context: I18nContext },
    dashboard,
  }: VisualizeServices,
  navActions: VisualizeNavActionMap
) => {
  // @ts-expect-error TS6133 TODO(ts-error): fixme
  const { vis, embeddableHandler } = visInstance;
  const savedVis = 'savedVis' in visInstance ? visInstance.savedVis : undefined;

  const topNavMenu = [
    ...(visualizeCapabilities.save && !embeddableId
      ? [
          {
            tooltip: i18n.translate('visualize.topNavMenu.saveVisualizationButtonLabel', {
              defaultMessage: 'Save',
            }),
            ariaLabel: i18n.translate('visualize.topNavMenu.saveVisualizationAriaLabel', {
              defaultMessage: 'Save visualization',
            }),
            testId: 'visualizeSaveButton',
            run: navActions[VisualizeTopNavIds.SAVE],
            iconType: 'save',
            controlType: 'icon',
            disableButton: hasUnappliedChanges,
          },
        ]
      : []),
    {
      tooltip: i18n.translate('visualize.topNavMenu.openInspectorTooltip', {
        defaultMessage: 'Inspect',
      }),
      ariaLabel: i18n.translate('visualize.topNavMenu.openInspectorButtonLabel', {
        defaultMessage: 'Inspect',
      }),
      testId: 'openInspectorButton',
      run: navActions[VisualizeTopNavIds.INSPECT],
      iconType: 'inspect',
      controlType: 'icon',
      disabled: !embeddableHandler.hasInspector || !embeddableHandler.hasInspector(),
    },
    {
      tooltip: i18n.translate('visualize.topNavMenu.shareVisualizationButtonLabel', {
        defaultMessage: 'Share',
      }),
      ariaLabel: i18n.translate('visualize.topNavMenu.shareVisualizationButtonAriaLabel', {
        defaultMessage: 'Share Visualization',
      }),
      testId: 'shareTopNavButton',
      run: navActions[VisualizeTopNavIds.SHARE],
      iconType: 'share',
      controlType: 'icon',
      disabled: !share || !!embeddableId,
    },
    ...(originatingApp === 'dashboards' || originatingApp === 'canvas'
      ? [
          {
            tooltip: i18n.translate('visualize.topNavMenu.cancelAndReturnButtonTooltip', {
              defaultMessage: 'Discard your changes before finishing',
            }),
            ariaLabel: i18n.translate('visualize.topNavMenu.cancelButtonAriaLabel', {
              defaultMessage: 'Return to the last app without saving changes',
            }),
            testId: 'visualizeCancelAndReturnButton',
            run: navActions[VisualizeTopNavIds.CANCEL],
            iconType: 'cross',
            controlType: 'icon',
          },
        ]
      : []),
    ...(originatingApp && ((savedVis && savedVis.id) || embeddableId)
      ? [
          {
            tooltip: i18n.translate('visualize.topNavMenu.saveAndReturnVisualizationButtonLabel', {
              defaultMessage: 'Save and return',
            }),
            ariaLabel: hasUnappliedChanges
              ? i18n.translate('visualize.topNavMenu.saveAndReturnVisualizationButtonAriaLabel', {
                  defaultMessage: 'Finish editing visualization and return to the last app',
                })
              : '',
            testId: 'visualizesaveAndReturnButton',
            run: navActions[VisualizeTopNavIds.SAVEANDRETURN],
            iconType: 'checkInCircleFilled',
            controlType: 'icon',
          },
        ]
      : []),
  ];
  return topNavMenu as TopNavMenuData[];
};
