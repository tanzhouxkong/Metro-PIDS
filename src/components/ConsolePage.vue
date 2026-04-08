<template>
    <div id="console-page" class="pids-ant-page pids-console-ant" style="flex:1; display:flex; flex-direction:column; overflow:auto; background:var(--bg); padding:24px 16px;">
      <a-space direction="vertical" :size="16" style="width:100%">
      <!-- Header -->
      <div style="display:flex; align-items:center; justify-content:space-between;">
          <div style="text-align:left;">
              <a-typography-title :level="4" style="margin:0; color:var(--text); letter-spacing:1px;">{{ t('console.title') }}</a-typography-title>
              <a-typography-text type="secondary" style="font-size:12px; font-weight:600;">{{ t('console.versionTag') }}</a-typography-text>
          </div>
      </div>
      
      <!-- Content -->
      <div style="width:100%;">
          <!-- Folder & Line Management -->
          <a-card variant="borderless" class="pids-ant-card pids-ant-card--orange">
          <div class="pids-ant-card-title pids-ant-card-title--orange">{{ t('console.lineManager') }}</div>
          
          <a-alert type="info" show-icon style="margin-bottom:12px;">
            <template #message>{{ t('console.currentLine') }}</template>
            <template #description>
              <a-typography-text strong style="font-size:16px;">{{ pidsState.appData?.meta?.lineName || 'None' }}</a-typography-text>
            </template>
          </a-alert>
          
          <a-row :gutter="[12,12]">
            <a-col :xs="24" :sm="12">
              <a-button type="primary" block class="pids-console-line-btn pids-console-line-btn--manager" @click="openLineManagerWindow()">
                <i class="fas fa-folder-open"></i>{{ t('console.openManager') }}
              </a-button>
            </a-col>
            <a-col :xs="24" :sm="12">
              <a-button block class="pids-console-line-btn pids-console-line-btn--save" @click="openLineManagerForSave('line')">
                <i class="fas fa-save"></i>{{ t('console.saveCurrentLine') }}
              </a-button>
            </a-col>
          </a-row>
          </a-card>
          
        <!-- Service Mode Settings -->
        <a-card variant="borderless" class="pids-ant-card pids-ant-card--red">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; flex-wrap:wrap; gap:10px;">
                <div class="pids-ant-card-title pids-ant-card-title--red" style="margin-bottom:0;">{{ t('console.serviceMode') }}</div>
                <a-space align="center" :size="10" wrap>
                    <a-typography-text type="secondary" style="font-size:14px; font-weight:600;">{{ t('console.currentMode') }}</a-typography-text>
                    <a-tag v-if="pidsState.appData.meta.serviceMode==='express'" color="orange" style="font-size:15px; padding:6px 14px; line-height:1.45; margin:0;">{{ t('console.modeExpress') }}</a-tag>
                    <a-tag v-else-if="pidsState.appData.meta.serviceMode==='direct'" color="red" style="font-size:15px; padding:6px 14px; line-height:1.45; margin:0;">{{ t('console.modeDirect') }}</a-tag>
                    <a-tag v-else color="blue" style="font-size:15px; padding:6px 14px; line-height:1.45; margin:0;">{{ t('console.modeNormal') }}</a-tag>
                </a-space>
            </div>
            
            <a-input v-model:value="pidsState.appData.meta.lineName" placeholder="Line name" style="width:100%; margin-bottom:12px;" @change="saveCfg()" />
            
            <a-space :wrap="false" :size="[10,10]" align="center" class="pids-console-line-toolbar" style="width:100%; margin-bottom:12px;">
                                <div class="pids-console-line-color-swatch" style="position:relative; width:60px; height:42px;">
                    <input
                        v-if="!hasElectronAPI"
                        type="color"
                        v-model="pidsState.appData.meta.themeColor"
                        style="position:absolute; top:0; left:0; width:100%; height:100%; padding:0; margin:0; border:none; border-radius:6px; cursor:pointer; opacity:0; z-index:2;"
                        title="Theme color"
                        @input="saveCfgAndPersistSilent()"
                    >
                    <div
                        :style="{position:'absolute', top:0, left:0, width:'100%', height:'100%', borderRadius:'6px', border:'2px solid var(--divider)', backgroundColor:pidsState.appData.meta.themeColor || '#00b894', pointerEvents:hasElectronAPI ? 'auto' : 'none', zIndex:1, cursor:'pointer'}"
                        title="Theme color"
                        @click="pickColor"
                    ></div>
                </div>
                <div class="pids-console-line-mode-btns">
                  <a-button
                    class="pids-console-line-mode-btn"
                    :type="pidsState.appData.meta.mode === 'loop' ? 'primary' : 'default'"
                    @click="setLineMode('loop')"
                  >
                    {{ t('console.loopLine') }}
                  </a-button>
                  <a-button
                    class="pids-console-line-mode-btn"
                    :type="pidsState.appData.meta.mode === 'linear' ? 'primary' : 'default'"
                    @click="setLineMode('linear')"
                  >
                    {{ t('console.singleLine') }}
                  </a-button>
                </div>
                <div
                  v-if="pidsState.appData.meta.mode === 'linear'"
                  class="pids-console-line-mode-btns pids-console-updown-btns"
                >
                  <a-button
                    class="pids-console-line-mode-btn"
                    :type="pidsState.appData.meta.dirType === 'up' ? 'primary' : 'default'"
                    @click="setDirType('up')"
                  >
                    <span class="pids-route-label">{{ t('console.dirLabel') }}</span>
                    <span class="pids-route-flow">
                      <span class="pids-route-flow__name">{{ pidsState.appData.stations[0]?.name }}</span>
                      <span class="pids-route-flow__arrow" aria-hidden="true"></span>
                      <span class="pids-route-flow__name">{{ pidsState.appData.stations[pidsState.appData.stations.length-1]?.name }}</span>
                    </span>
                  </a-button>
                  <a-button
                    class="pids-console-line-mode-btn"
                    :type="pidsState.appData.meta.dirType === 'down' ? 'primary' : 'default'"
                    @click="setDirType('down')"
                  >
                    <span class="pids-route-label">{{ t('console.dirLabelDown') || t('console.dirLabel') }}</span>
                    <span class="pids-route-flow">
                      <span class="pids-route-flow__name">{{ pidsState.appData.stations[pidsState.appData.stations.length-1]?.name }}</span>
                      <span class="pids-route-flow__arrow" aria-hidden="true"></span>
                      <span class="pids-route-flow__name">{{ pidsState.appData.stations[0]?.name }}</span>
                    </span>
                  </a-button>
                </div>
                <div
                  v-else-if="pidsState.appData.meta.mode === 'loop'"
                  class="pids-console-line-mode-btns pids-console-loop-dir-btns"
                >
                  <a-button
                    class="pids-console-line-mode-btn"
                    :type="pidsState.appData.meta.dirType === 'outer' ? 'primary' : 'default'"
                    @click="setDirType('outer')"
                  >
                    {{ t('console.outerLoop') }}
                  </a-button>
                  <a-button
                    class="pids-console-line-mode-btn"
                    :type="pidsState.appData.meta.dirType === 'inner' ? 'primary' : 'default'"
                    @click="setDirType('inner')"
                  >
                    {{ t('console.innerLoop') }}
                  </a-button>
                </div>
            </a-space>

            <a-divider style="margin:12px 0;" />
            <a-typography-text type="secondary" strong style="display:block; margin-bottom:8px;">{{ t('console.serviceMode') }}</a-typography-text>
            <a-radio-group
              :value="pidsState.appData.meta.serviceMode"
              option-type="button"
              button-style="solid"
              class="pids-console-radio-wrap pids-console-radio-wrap--service-row"
              @update:value="changeServiceMode"
            >
              <a-radio-button value="normal">{{ t('console.modeNormal') }}</a-radio-button>
              <a-radio-button value="express">{{ t('console.modeExpress') }}</a-radio-button>
              <a-radio-button value="direct">{{ t('console.modeDirect') }}</a-radio-button>
            </a-radio-group>
            <a-typography-text type="secondary" style="font-size:12px; display:block; margin-top:8px; line-height:1.6;">
              {{ t('console.modeHint') }}
            </a-typography-text>
        </a-card>
        
        <!-- Short Turn Settings -->
        <a-card variant="borderless" class="pids-ant-card pids-ant-card--purple">
            <div class="pids-ant-card-title pids-ant-card-title--purple">{{ t('console.shortTurn') }}</div>
            <div style="display:grid; grid-template-columns: 72px minmax(0, 1fr); gap:12px; align-items:center; margin-bottom:12px;">
                <label style="color:var(--muted);">{{ t('console.shortTurnStart') }}</label>
                <div ref="shortTurnStartDropdownRef" style="position:relative; min-width:0;">
                    <div
                        @click="toggleShortTurnStartDropdown"
                        :style="shortTurnDropdownTriggerStyle"
                    >
                        <span style="font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">{{ shortTurnStartTitle }}</span>
                        <i :class="showShortTurnStartDropdown ? 'fas fa-chevron-up' : 'fas fa-chevron-down'" style="font-size:12px; color:var(--muted);"></i>
                    </div>
                    <div v-if="showShortTurnStartDropdown" v-glassmorphism="glassDropdownDirective" :style="shortTurnStartDropdownMenuStyle">
                        <div @click="selectShortTurnStart(-1)" :style="{ padding:'8px 10px', borderRadius:'8px', cursor:'pointer', fontSize:'13px', color:'var(--text)', background: pidsState.appData.meta.pendingShortTurnStartIdx === -1 ? shortTurnItemActiveBackground() : 'transparent' }" @mouseover="$event.currentTarget.style.background=shortTurnItemHoverBackground()" @mouseout="$event.currentTarget.style.background = (pidsState.appData.meta.pendingShortTurnStartIdx === -1 ? shortTurnItemActiveBackground() : 'transparent')">None</div>
                        <div v-for="(s,i) in pidsState.appData.stations" :key="'s'+i" @click="selectShortTurnStart(i)" :style="{ padding:'8px 10px', borderRadius:'8px', cursor:'pointer', fontSize:'13px', color:'var(--text)', background: pidsState.appData.meta.pendingShortTurnStartIdx === i ? shortTurnItemActiveBackground() : 'transparent' }" @mouseover="$event.currentTarget.style.background=shortTurnItemHoverBackground()" @mouseout="$event.currentTarget.style.background = (pidsState.appData.meta.pendingShortTurnStartIdx === i ? shortTurnItemActiveBackground() : 'transparent')">[{{i+1}}] {{s.name}}</div>
                    </div>
                </div>
            </div>

            <div style="display:grid; grid-template-columns: 72px minmax(0, 1fr); gap:12px; align-items:center; margin-bottom:16px;">
                <label style="color:var(--muted);">{{ t('console.shortTurnEnd') }}</label>
                <div ref="shortTurnEndDropdownRef" style="position:relative; min-width:0;">
                    <div
                        @click="toggleShortTurnEndDropdown"
                        :style="shortTurnDropdownTriggerStyle"
                    >
                        <span style="font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">{{ shortTurnEndTitle }}</span>
                        <i :class="showShortTurnEndDropdown ? 'fas fa-chevron-up' : 'fas fa-chevron-down'" style="font-size:12px; color:var(--muted);"></i>
                    </div>
                    <div v-if="showShortTurnEndDropdown" v-glassmorphism="glassDropdownDirective" :style="shortTurnEndDropdownMenuStyle">
                        <div @click="selectShortTurnEnd(-1)" :style="{ padding:'8px 10px', borderRadius:'8px', cursor:'pointer', fontSize:'13px', color:'var(--text)', background: pidsState.appData.meta.pendingShortTurnTermIdx === -1 ? shortTurnItemActiveBackground() : 'transparent' }" @mouseover="$event.currentTarget.style.background=shortTurnItemHoverBackground()" @mouseout="$event.currentTarget.style.background = (pidsState.appData.meta.pendingShortTurnTermIdx === -1 ? shortTurnItemActiveBackground() : 'transparent')">None</div>
                        <div v-for="(s,i) in pidsState.appData.stations" :key="'e'+i" @click="selectShortTurnEnd(i)" :style="{ padding:'8px 10px', borderRadius:'8px', cursor:'pointer', fontSize:'13px', color:'var(--text)', background: pidsState.appData.meta.pendingShortTurnTermIdx === i ? shortTurnItemActiveBackground() : 'transparent' }" @mouseover="$event.currentTarget.style.background=shortTurnItemHoverBackground()" @mouseout="$event.currentTarget.style.background = (pidsState.appData.meta.pendingShortTurnTermIdx === i ? shortTurnItemActiveBackground() : 'transparent')">[{{i+1}}] {{s.name}}</div>
                    </div>
                </div>
            </div>

            <a-space style="width:100%; justify-content:flex-end; margin-bottom:16px;" wrap>
                <a-button @click="clearShortTurn()">{{ t('console.shortTurnClear') }}</a-button>
                <a-button type="primary" style="background:#5F27CD; border-color:#5F27CD;" @click="applyShortTurn()">{{ t('console.shortTurnApply') }}</a-button>
            </a-space>

            <!-- 闂傚倸鍊搁崐鎼佸磹閻戣姤鍊块柨鏇楀亾妞ゎ亜鍟村畷绋课旈埀顒勬儗濡ゅ懎绠规繛锝庡墮婵″ジ鏌涚仦璇插闁哄本绋戦埞鎴﹀幢濡ゅ﹣绱濇繝鐢靛仜閻ㄧ兘寮查悩璇茶摕闁靛ň鏅涚猾宥夋煕鐏炲墽鐓瑙勬礋閹鎲撮崟顒傤槬濡炪倧缂氶崡铏繆閻㈢绀嬫い鏍ㄨ壘閸炪劌顪冮妶鍡楀闁搞劏顫夌粩鐔稿緞閹邦厸鎷洪梺鍛婄箓鐎氼參藟閻愬绠鹃柤纰卞墮閺嬫稒顨ラ悙鎻掓殶闁瑰弶鎸冲畷鐔碱敆閳ь剟顢撻幘鍓佺＝濞达絽澹婇崕蹇曠磼閵娾晙鎲炬鐐村姍瀹曟﹢鈥﹂幋鐐茬槣闂備線娼ч悧鍡椢涘▎鎴滅剨濞寸厧鐡ㄩ悡娆愩亜閺冨倸甯堕柍褜鍓欏锟犳偘?-->
            <a-typography-text type="secondary" strong style="display:block; margin-bottom:12px;">{{ t('console.shortTurnPreset') }}</a-typography-text>
            <a-row :gutter="[8,8]" style="margin-bottom:12px;">
              <a-col :span="24" :md="12">
                <a-button type="primary" block size="middle" class="pids-console-compact-btn" style="background:#5F27CD; border-color:#5F27CD;" @click="saveShortTurnPreset()">
                  <i class="fas fa-save"></i>{{ t('console.shortTurnSavePreset') }}
                </a-button>
              </a-col>
              <a-col :span="24" :md="12">
                <a-button block size="middle" class="pids-console-compact-btn" style="background:#00D2D3; border-color:#00D2D3; color:#fff;" @click="loadShortTurnPresets()">
                  <i class="fas fa-sync-alt"></i>{{ t('console.shortTurnRefresh') }}
                </a-button>
              </a-col>
            </a-row>
            <div 
                v-if="shortTurnPresets.length > 0" 
                style="max-height:200px; overflow-y:auto; border:1px solid var(--divider); border-radius:6px; padding:8px; margin-bottom:12px;"
                @contextmenu.prevent="showPresetContextMenu($event, null)"
            >
                <div v-for="preset in shortTurnPresets" :key="preset.name" @contextmenu.prevent="showPresetContextMenu($event, preset)" style="display:flex; align-items:center; justify-content:space-between; padding:8px; margin-bottom:4px; background:var(--input-bg); border-radius:4px; cursor:pointer;" @click="loadShortTurnPreset(preset.name)">
                    <div style="flex:1; min-width:0;">
                        <div style="font-size:13px; font-weight:bold; color:var(--text); margin-bottom:2px;">{{ preset.name }}</div>
                        <div style="font-size:11px; color:var(--muted);">
                            {{ preset.startStationName || ('Station ' + (preset.startIdx + 1)) }} -> {{ preset.termStationName || ('Station ' + (preset.termIdx + 1)) }}
                        </div>
                    </div>
                </div>
            </div>
            <div 
                v-else 
                style="padding:12px; text-align:center; color:var(--muted); font-size:12px; border:1px dashed var(--divider); border-radius:6px; margin-bottom:12px; cursor:context-menu;"
                @contextmenu.prevent="showPresetContextMenu($event, null)"
            >
                <!-- 闂傚倸鍊搁崐鎼佸磹妞嬪海鐭嗗〒姘ｅ亾妤犵偛顦甸弫鎾绘偐閸愯弓鐢绘俊鐐€栭悧婊堝磻濞戙垹鍨傞柛宀€鍋為埛鎴炪亜閹哄棗浜剧紓浣割槺閺佽鐣烽幋鐘亾閿濆骸鏋熼柣鎾寸懅缁辨挻鎷呴棃娑氫患闂佸搫顑嗙粙鎾舵閹烘鍋愰柟缁樺笧妤犲洭姊洪棃娑欐悙閻庢碍婢橀锝夊级閹宠櫕妫冮崺鈧い鎺嶈兌椤╂煡鏌熼鍡忓亾闁衡偓娴犲鐓熼柟閭﹀墰閹界娀鎮樿箛锝呭箹妞ゎ叀鍎婚ˇ鏌ユ⒑鐢喚绉柣娑卞枟瀵板嫰骞囬鐐扮綍闂備礁澹婇崑鍡涘窗鎼搭煈鏁侀柟鍓х帛閻撶喖鏌ｉ弬鎸庢喐闁瑰啿鍟撮幃妤€顫濋悡搴㈢彎閻庤娲忛崹浠嬬嵁閸ヮ剦鏁囬柣妯兼暩濡?i18n 闂傚倸鍊搁崐鎼佸磹妞嬪海鐭嗗〒姘ｅ亾妤犵偞鐗犻、鏇㈡晝閳ь剛澹曢崷顓犵＜閻庯綆鍋撶槐鈺傜箾瀹割喕绨奸柡鍛箞閺屾稓浠﹂崢鈺傚哺瀹?-->
                闂傚倸鍊搁崐鎼佸磹妞嬪海鐭嗗〒姘ｅ亾妤犵偞鐗犻、鏇㈠煑閼恒儳鈽夐摶鏍煕濞戝崬骞橀柨娑欑懇濮婃椽鎳￠妶鍛€鹃柣搴㈣壘閻楀棝鍩ユ径鎰潊闁绘ɑ鐖犻崶銊у幈闂佸疇妫勫Λ妤呯嵁濮椻偓閺岋綁顢橀悤浣圭杹濠殿喖锕ュ钘夌暦閵婏妇绡€闁告劦鐓堝Σ閬嶆⒒娓氣偓濞艰崵绱為崱娑橀棷闁挎繂鎳愰弳锔姐亜閺嶃劎鈯曢柛搴ｅ枛閺屾洘绻濊箛鎿冩喘闂佸憡鐟ュΛ妤呭煘閹达附鍊烽柡澶嬪灩娴犵顪冮妶搴″箹婵炲樊鍙冮獮鍐潨閳ь剟寮婚崱妤婂悑闁糕剝鐟ラ獮鍫ユ⒑鐠囨彃鍤辩紒鑼跺Г閺呰埖鎯旈敐鍥╃厠濡炪倖妫冮弫顕€宕?濠电姷鏁告慨鐑藉极閹间礁纾块柟瀵稿Т缁躲倝鏌﹀Ο渚＆婵炲樊浜濋弲婊堟煟閹伴潧澧幖鏉戯躬濮婅櫣绮欑捄銊т紘闂佺顑囬崑銈呯暦閹达箑围濠㈣泛顑囬崢顏呯節閻㈤潧孝缂佺粯顨婇、姗€鎼归崷顓狅紲闂佽褰冮鍥╃矓椤曗偓閺岋紕浠﹂崜褎鍒涢悗娈垮枟閹歌櫕淇婇幖浣肝ㄩ柨鏃€鍎抽拏瀣⒒?濠电姷鏁告慨鐑藉极閹间礁纾块柟瀵稿Т缁躲倝鏌﹀Ο渚＆婵炲樊浜濋弲婊堟煟閹伴潧澧幖鏉戯躬濮婅櫣绮欑捄銊т紘闂佺顑囬崑銈呯暦閹达箑围濠㈣泛顑囬崢顏呯節閻㈤潧浠滈柣蹇旂箖娣囧﹦绮欏Λ鐢垫嚀椤劑宕橀鍠般劑姊洪崫鍕伇闁哥姵鐗犻悰顕€宕卞鍏夹╅梻浣告惈濡粍銇旈幖浣肝﹂柛鏇ㄥ灠鍥撮梺鍛婁緱閸犳牕鈻撳Δ鍛拺闁告繂瀚悞璺ㄧ磽瀹ュ嫮绐旈柕鍡曠铻ｆ繛鍡欏亾浜涘┑掳鍊楁慨鐑藉磻閻愬灚鏆滄俊銈呮噹缁犵偤鏌曟繛鍨姶婵炵鍔戦弻娑㈩敃閿濆洨顓煎┑鐐叉▕閸欏啫顫忓ú顏勬嵍妞ゆ挾鍠庡▓宀勬煟鎼淬垻鐓柛妤佸▕婵″瓨鎷呯化鏇燁潔濠碘槅鍨堕弨閬嶅棘閳ь剟姊绘担鍝ョШ闁稿锕畷婊冾潩椤戣姤鐎哄┑掳鍊曢崯鎵娴犲鐓曢悘鐐村礃婢规﹢鏌嶈閸撴岸骞冮崒姘辨殾闁哄顑欏鈺呮偣閻戞ɑ銇濇俊顐㈠槻椤啴濡堕崱娆忣潷缂備緡鍠栫粔褰掓晲閻愬搫鍗抽柣鏃囨椤旀洟姊虹化鏇炲⒉閽冮亶鎮樿箛锝呭籍闁哄矉缍侀、姗€鎮ゆ担鍦澒闂備礁鎼惉濂稿窗閺嶎厾宓侀柛鈩冪☉缁狙囨煕閻斿嘲鏆為柟鐟版喘瀵鏁撻悩鎻掕€垮┑鈽嗗灠閻ㄩ攱鎱ㄩ崶顒佲拺闂侇偅绋撻埞鎺楁煕閺傝法鐒搁柛鈺冨仱楠炲鏁冮埀顒傜矆鐎ｎ偁浜滈柟閭﹀枛閺嬪骸霉濠婂牏鐣洪柡宀嬬節瀹曞爼鏁愰崱妤佺枀闂備焦鎮堕崕娲礈濞嗘挻鍋傛繛鎴欏灪閻撴洘绻涢幋婵嗚埞妤犵偞锕㈤弻锝夊箻閺夋垹浠村銈庝簻閸熷瓨淇婇崼鏇炲耿婵炲棗娴氬鐑芥⒒娴ｈ棄鍚归柛鐔哥懇瀹曞爼濡搁妷銉ヮ棗闂傚倷绶氬褔鎮ч崱娴板洦瀵肩€涙ê浜楅梺鍝勬储閸ㄦ椽鎮″▎鎾寸厽闁瑰浼濋鍫熷€堕柨鏂款潟娴滄粓鏌曟径娑橆洭闁瑰啿娲﹂幈銊︾節閸曨厼绗＄紓浣虹帛閻╊垶骞冨▎鎿冩晢濞达絽鎼紞鍐⒒閸屾瑦绁版い鏇熺墵瀹曞綊骞嶉鍓х厠闂佹眹鍨婚…鍫㈢不椤栫偞鐓曟繛鎴炵懄缂嶆垹绱掗埀顒勫醇閵夛妇鍘电紓鍌欑劍閿氱紒妤佺閵囧嫰寮埀顒勫箲閸パ屾綎缂備焦蓱婵潙銆掑鐓庣仯闁告柨鎽滅槐鎾存媴缁涘娈梺缁橆殕閹告悂鎮鹃悜钘夊嵆闁靛繆鈧櫕顓奸梻渚€娼ч悧鍡椢涢鐑嗙劷?            </div>
        </a-card>

        <!-- Through Line Settings -->
        <a-card variant="borderless" class="pids-ant-card pids-ant-card--violet pids-console-through-outer">
            <div class="pids-ant-card-title pids-ant-card-title--violet">{{ t('console.throughTitle') }}</div>
            
            <div class="pids-console-through-box" style="background:var(--input-bg); border:1px solid var(--divider);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; gap:8px;">
                    <div style="font-size:13px; font-weight:600; color:var(--text);">{{ t('console.throughSegments') }}</div>
                    <a-button type="primary" class="pids-console-through-btn" style="background:#2ED573; border-color:#2ED573;" @click="addThroughLineSegment()">
                        <i class="fas fa-plus"></i>{{ t('console.throughAdd') }}
                    </a-button>
                </div>
                
                <div v-if="throughLineSegments.length === 0" style="padding:8px; text-align:center; color:var(--muted); font-size:12px; border:1px dashed var(--divider); border-radius:4px; margin-bottom:0;">
                    {{ t('console.throughNoSegments') }}
                </div>
                
                <div v-for="(segment, index) in throughLineSegments" :key="index" style="margin-bottom:8px; padding:8px; background:var(--bg); border:1px solid var(--divider); border-radius:6px;">
                    <div style="display:flex; align-items:center; gap:6px; margin-bottom:6px; flex-wrap:wrap;">
                        <div style="min-width:52px; font-size:12px; font-weight:600; color:var(--text);">
                            {{ t('console.throughLineLabel') + String.fromCharCode('A'.charCodeAt(0) + index) }}
                        </div>
                        <div style="flex:1; min-width:120px; padding:4px 8px; border-radius:4px; border:1px solid var(--divider); background:var(--input-bg); color:var(--text); font-size:12px; min-height:26px; display:flex; align-items:center;">
                            {{ segment.lineName || t('console.throughNotSelected') }}
                        </div>
                        <a-button type="primary" class="pids-console-through-btn" style="background:#9B59B6; border-color:#9B59B6; white-space:nowrap;" @click="openLineManagerForSegment(index)">
                            <i class="fas fa-folder-open"></i>{{ t('console.throughSelect') }}
                        </a-button>
                        <a-button v-if="throughLineSegments.length > 2" danger size="small" class="pids-console-through-btn" @click="removeThroughLineSegment(index)">
                            <i class="fas fa-trash"></i>
                        </a-button>
                    </div>
                    <div v-if="index < throughLineSegments.length - 1" style="display:grid; grid-template-columns: 52px 1fr; gap:6px; align-items:center; margin-top:6px;">
                            <label :style="throughStationLabelStyle">{{ t('console.throughStation') }}</label>
                        <div v-if="segment.candidateThroughStations && segment.candidateThroughStations.length > 1" class="through-station-dropdown" style="position:relative;">
                            <div
                                @click="toggleThroughStationDropdown(index)"
                                :style="[{ ...throughStationControlStyle, display:'flex', alignItems:'center', justifyContent:'space-between', cursor:'pointer' }]"
                            >
                                <span>{{ segment.throughStationName || '请选择贯通站点' }}</span>
                                <i :class="throughStationDropdownIndex === index ? 'fas fa-chevron-up' : 'fas fa-chevron-down'" style="font-size:11px; color:var(--muted);"></i>
                            </div>
                            <div v-if="throughStationDropdownIndex === index" v-glassmorphism="glassDropdownDirective" :style="throughStationDropdownMenuStyle">
                                <div
                                    @click="selectThroughStation(index, '')"
                                    :style="{
                                        padding: '9px 10px',
                                        borderRadius: '8px',
                                        cursor: 'pointer',
                                        color: 'var(--text)',
                                        fontSize: '13px',
                                        fontWeight: !segment.throughStationName ? '700' : '500',
                                        background: !segment.throughStationName ? shortTurnItemActiveBackground() : 'transparent'
                                    }"
                                    @mouseover="$event.currentTarget.style.background=shortTurnItemHoverBackground()"
                                    @mouseout="$event.currentTarget.style.background = (!segment.throughStationName ? shortTurnItemActiveBackground() : 'transparent')"
                                >
                                    闂傚倸鍊搁崐宄懊归崶褏鏆﹂柛顭戝亝閸欏繘鏌℃径瀣婵炲樊浜滄儫闂佸疇妗ㄩ懗鍫曀囪閳规垿顢欐慨鎰捕闂佺顑嗛幑鍥蓟濞戙垹鐓橀柟顖嗗倸顥氭繝纰夌磿閸嬫垿宕愰弽褜鍟呭┑鐘宠壘绾惧鏌熼悙顒傛殬濞存粍绮撻弻銊╁籍閸ヮ煈妫勫銈冨劚椤戝寮诲鍫闂佸憡鎸诲畝绋跨暦椤愶絾鍎熼柕濞垮劤椤︻噣鏌熼崗鑲╂殬闁告柨鐬肩划濠氼敍濠婂嫬鏋戦梺缁橆殔閻楀棙绌遍鐐寸厸濞达絽鎽滄晥闂佸搫鐭夌紞渚€鐛崶顒€惟闁挎梻鏅ぐ鍛攽閻愯尙鎽犵紒顔奸叄瀹曟垿骞樼拠鑼杽闂侀潧顭堥崕娆撴偄缁嬭法绐炵紓浣割儐鐎笛囧磿閹剧粯鐓熼柣鏂挎憸閻苯顭胯椤ㄥ﹪骞冮敓鐘虫櫢闁绘灏幗?                                </div>
                                <div
                                    v-for="stationName in segment.candidateThroughStations"
                                    :key="stationName"
                                    @click="selectThroughStation(index, stationName)"
                                    :style="{
                                        padding: '9px 10px',
                                        borderRadius: '8px',
                                        cursor: 'pointer',
                                        color: 'var(--text)',
                                        fontSize: '13px',
                                        fontWeight: segment.throughStationName === stationName ? '700' : '500',
                                        background: segment.throughStationName === stationName ? shortTurnItemActiveBackground() : 'transparent'
                                    }"
                                    @mouseover="$event.currentTarget.style.background=shortTurnItemHoverBackground()"
                                    @mouseout="$event.currentTarget.style.background = (segment.throughStationName === stationName ? shortTurnItemActiveBackground() : 'transparent')"
                                >
                                    {{ stationName }}
                                </div>
                            </div>
                        </div>
                        <div v-else :style="[{ ...throughStationControlStyle, display: 'flex', alignItems: 'center' }]">
                            {{ segment.throughStationName || t('console.throughNotDetected') }}
                        </div>
                    </div>
                </div>
            </div>

            <a-space style="width:100%; justify-content:flex-end;" :size="8">
                <a-button class="pids-console-through-footer" @click="clearThroughOperation()">{{ t('console.shortTurnClear') }}</a-button>
                <a-button type="primary" class="pids-console-through-footer" style="background:#9B59B6; border-color:#9B59B6;" @click="applyThroughOperation()">{{ t('console.shortTurnApply') }}</a-button>
            </a-space>
        </a-card>
        
        <!-- Autoplay Control -->
        <a-card variant="borderless" class="pids-ant-card pids-ant-card--blue">
          <div class="pids-ant-card-title pids-ant-card-title--blue">{{ t('console.autoplayTitle') }}</div>
          
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; flex-wrap:wrap; gap:12px;">
              <a-typography-text>{{ t('console.autoplayEnable') }}</a-typography-text>
              <a-switch
                :checked="isPlaying"
                @change="(checked) => checked ? startWithLock(settings.autoplay.intervalSec) : stopWithUnlock()"
              />
          </div>
          
          <a-space align="center" wrap>
              <a-typography-text type="secondary">{{ t('console.autoplayInterval') }}</a-typography-text>
              <a-input-number v-model:value="settings.autoplay.intervalSec" :min="1" :max="3600" style="width:100px;" @change="applyAutoplayIntervalSec()" />
              <a-typography-text v-if="isPlaying" type="secondary" style="font-size:12px;">({{ nextIn }}s)</a-typography-text>
          </a-space>
        </a-card>
        
        <!-- Video Recording Control -->
        <a-card variant="borderless" class="pids-ant-card pids-ant-card--recording">
          <div class="pids-ant-card-title pids-ant-card-title--recording">{{ t('console.recordingTitle') }}</div>
          
          <!-- Display Info (use settings page selection) -->
          <a-form-item :label="t('console.recordingDisplay')" style="margin-bottom:12px;">
            <a-input :value="currentRecordingDisplay ? currentRecordingDisplay.name : ''" :placeholder="t('console.recordingSelectDisplay')" readonly />
          </a-form-item>

          <!-- Encoder Selection -->
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px;">
            <div>
              <a-form-item :label="t('console.recordingEncoder')" style="margin-bottom:0;">
                            <div class="recording-dropdown" style="position:relative;">
                                <div
                                    @click="toggleRecordingDropdown('encoder')"
                                    :style="[{ ...recordingSelectStyle, display:'flex', alignItems:'center', justifyContent:'space-between', cursor: recordingState.isRecording ? 'not-allowed' : 'pointer', opacity: recordingState.isRecording ? 0.7 : 1 }]"
                                >
                                    <span>{{ getRecordingOptionLabel(recordingEncoderOptions, recordingState.encoder) }}</span>
                                    <i :class="recordingDropdownOpenKey === 'encoder' ? 'fas fa-chevron-up' : 'fas fa-chevron-down'" style="font-size:11px; color:var(--muted);"></i>
                                </div>
                                <div v-if="recordingDropdownOpenKey === 'encoder'" v-glassmorphism="glassDropdownDirective" :style="recordingDropdownMenuStyle">
                                    <div
                                        v-for="opt in recordingEncoderOptions"
                                        :key="'encoder-' + opt.value"
                                        @click="selectRecordingDropdownValue('encoder', opt.value)"
                                        :style="{
                                            padding: '9px 10px',
                                            borderRadius: '8px',
                                            cursor: 'pointer',
                                            color: 'var(--text)',
                                            fontSize: '13px',
                                            fontWeight: recordingState.encoder === opt.value ? '700' : '500',
                                            background: recordingState.encoder === opt.value ? shortTurnItemActiveBackground() : 'transparent'
                                        }"
                                        @mouseover="$event.currentTarget.style.background=shortTurnItemHoverBackground()"
                                        @mouseout="$event.currentTarget.style.background = (recordingState.encoder === opt.value ? shortTurnItemActiveBackground() : 'transparent')"
                                    >
                                        {{ opt.label }}
                                    </div>
                                </div>
                            </div>
              </a-form-item>
            </div>
            <div>
              <a-form-item :label="t('console.recordingCodec')" style="margin-bottom:0;">
                            <div class="recording-dropdown" style="position:relative;">
                                <div
                                    @click="toggleRecordingDropdown('codec')"
                                    :style="[{ ...recordingSelectStyle, display:'flex', alignItems:'center', justifyContent:'space-between', cursor: recordingState.isRecording ? 'not-allowed' : 'pointer', opacity: recordingState.isRecording ? 0.7 : 1 }]"
                                >
                                    <span>{{ getRecordingOptionLabel(recordingCodecOptions, recordingState.codec) }}</span>
                                    <i :class="recordingDropdownOpenKey === 'codec' ? 'fas fa-chevron-up' : 'fas fa-chevron-down'" style="font-size:11px; color:var(--muted);"></i>
                                </div>
                                <div v-if="recordingDropdownOpenKey === 'codec'" v-glassmorphism="glassDropdownDirective" :style="recordingDropdownMenuStyle">
                                    <div
                                        v-for="opt in recordingCodecOptions"
                                        :key="'codec-' + opt.value"
                                        @click="selectRecordingDropdownValue('codec', opt.value)"
                                        :style="{
                                            padding: '9px 10px',
                                            borderRadius: '8px',
                                            cursor: 'pointer',
                                            color: 'var(--text)',
                                            fontSize: '13px',
                                            fontWeight: recordingState.codec === opt.value ? '700' : '500',
                                            background: recordingState.codec === opt.value ? shortTurnItemActiveBackground() : 'transparent'
                                        }"
                                        @mouseover="$event.currentTarget.style.background=shortTurnItemHoverBackground()"
                                        @mouseout="$event.currentTarget.style.background = (recordingState.codec === opt.value ? shortTurnItemActiveBackground() : 'transparent')"
                                    >
                                        {{ opt.label }}
                                    </div>
                                </div>
                            </div>
              </a-form-item>
            </div>
          </div>

          <!-- Container Selection -->
          <div style="margin-bottom:12px;">
            <a-form-item :label="t('console.recordingContainer')" style="margin-bottom:0;">
                        <div class="recording-dropdown" style="position:relative;">
                            <div
                                @click="toggleRecordingDropdown('container')"
                                :style="[{ ...recordingSelectStyle, display:'flex', alignItems:'center', justifyContent:'space-between', cursor: recordingState.isRecording ? 'not-allowed' : 'pointer', opacity: recordingState.isRecording ? 0.7 : 1 }]"
                            >
                                <span>{{ getRecordingOptionLabel(recordingContainerOptions, recordingState.container) }}</span>
                                <i :class="recordingDropdownOpenKey === 'container' ? 'fas fa-chevron-up' : 'fas fa-chevron-down'" style="font-size:11px; color:var(--muted);"></i>
                            </div>
                            <div v-if="recordingDropdownOpenKey === 'container'" v-glassmorphism="glassDropdownDirective" :style="recordingDropdownMenuStyle">
                                <div
                                    v-for="opt in recordingContainerOptions"
                                    :key="'container-' + opt.value"
                                    @click="selectRecordingDropdownValue('container', opt.value)"
                                    :style="{
                                        padding: '9px 10px',
                                        borderRadius: '8px',
                                        cursor: 'pointer',
                                        color: 'var(--text)',
                                        fontSize: '13px',
                                        fontWeight: recordingState.container === opt.value ? '700' : '500',
                                        background: recordingState.container === opt.value ? shortTurnItemActiveBackground() : 'transparent'
                                    }"
                                    @mouseover="$event.currentTarget.style.background=shortTurnItemHoverBackground()"
                                    @mouseout="$event.currentTarget.style.background = (recordingState.container === opt.value ? shortTurnItemActiveBackground() : 'transparent')"
                                >
                                    {{ opt.label }}
                                </div>
                            </div>
                        </div>
            </a-form-item>
          </div>

          <!-- Bitrate and FPS -->
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px;">
            <div>
              <a-form-item :label="t('console.recordingBitrate')" style="margin-bottom:0;">
                <a-space>
                  <a-input-number
                    v-model:value="recordingState.bitrate"
                    :disabled="recordingState.isRecording"
                    :min="1"
                    :max="50"
                    :step="1"
                    style="width:100%; min-width:120px;"
                  />
                  <a-typography-text type="secondary">Mbps</a-typography-text>
                </a-space>
              </a-form-item>
            </div>
            <div>
              <a-form-item :label="t('console.recordingFPS')" style="margin-bottom:0;">
                            <div class="recording-dropdown" style="position:relative;">
                                <div
                                    @click="toggleRecordingDropdown('fps')"
                                    :style="[{ ...recordingSelectStyle, display:'flex', alignItems:'center', justifyContent:'space-between', cursor: recordingState.isRecording ? 'not-allowed' : 'pointer', opacity: recordingState.isRecording ? 0.7 : 1 }]"
                                >
                                    <span>{{ getRecordingOptionLabel(recordingFpsOptions, recordingState.fps) }}</span>
                                    <i :class="recordingDropdownOpenKey === 'fps' ? 'fas fa-chevron-up' : 'fas fa-chevron-down'" style="font-size:11px; color:var(--muted);"></i>
                                </div>
                                <div v-if="recordingDropdownOpenKey === 'fps'" v-glassmorphism="glassDropdownDirective" :style="recordingDropdownMenuStyle">
                                    <div
                                        v-for="opt in recordingFpsOptions"
                                        :key="'fps-' + opt.value"
                                        @click="selectRecordingDropdownValue('fps', opt.value)"
                                        :style="{
                                            padding: '9px 10px',
                                            borderRadius: '8px',
                                            cursor: 'pointer',
                                            color: 'var(--text)',
                                            fontSize: '13px',
                                            fontWeight: Number(recordingState.fps) === Number(opt.value) ? '700' : '500',
                                            background: Number(recordingState.fps) === Number(opt.value) ? shortTurnItemActiveBackground() : 'transparent'
                                        }"
                                        @mouseover="$event.currentTarget.style.background=shortTurnItemHoverBackground()"
                                        @mouseout="$event.currentTarget.style.background = (Number(recordingState.fps) === Number(opt.value) ? shortTurnItemActiveBackground() : 'transparent')"
                                    >
                                        {{ opt.label }}
                                    </div>
                                </div>
                            </div>
              </a-form-item>
            </div>
          </div>

          <!-- Interval (like autoplay) -->
          <a-form-item :label="t('console.recordingIntervalLabel')" style="margin-bottom:12px;">
            <a-input-number
              v-model:value="recordingState.intervalSec"
              :disabled="recordingState.isRecording"
              :min="1"
              :max="60"
              :step="1"
              style="width:100%; max-width:200px;"
            />
          </a-form-item>

          <!-- Parallel Segment Recording -->
          <div style="margin-bottom:12px; padding:10px; border-radius:10px; border:1px solid var(--divider); background:var(--input-bg);">
            <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:10px;">
              <a-typography-text type="secondary" strong>{{ t('console.recordingParallelTitle') }}</a-typography-text>
              <a-switch
                :checked="recordingState.parallelEnabled"
                :disabled="recordingState.isRecording"
                @change="(v) => { recordingState.parallelEnabled = v }"
              />
            </div>
            <div v-if="recordingState.parallelEnabled" style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
              <div>
                <a-form-item :label="t('console.recordingParallelism')" style="margin-bottom:0;">
                                <div class="recording-dropdown" style="position:relative;">
                                    <div
                                        @click="toggleRecordingDropdown('parallelism')"
                                        :style="[{ ...recordingSelectStyle, display:'flex', alignItems:'center', justifyContent:'space-between', cursor: recordingState.isRecording ? 'not-allowed' : 'pointer', opacity: recordingState.isRecording ? 0.7 : 1 }]"
                                    >
                                        <span>{{ getRecordingOptionLabel(recordingParallelismOptions, recordingState.parallelism) }}</span>
                                        <i :class="recordingDropdownOpenKey === 'parallelism' ? 'fas fa-chevron-up' : 'fas fa-chevron-down'" style="font-size:11px; color:var(--muted);"></i>
                                    </div>
                                    <div v-if="recordingDropdownOpenKey === 'parallelism'" v-glassmorphism="glassDropdownDirective" :style="recordingDropdownMenuStyle">
                                        <div
                                            v-for="opt in recordingParallelismOptions"
                                            :key="'parallelism-' + opt.value"
                                            @click="selectRecordingDropdownValue('parallelism', opt.value)"
                                            :style="{
                                                padding: '9px 10px',
                                                borderRadius: '8px',
                                                cursor: 'pointer',
                                                color: 'var(--text)',
                                                fontSize: '13px',
                                                fontWeight: Number(recordingState.parallelism) === Number(opt.value) ? '700' : '500',
                                                background: Number(recordingState.parallelism) === Number(opt.value) ? shortTurnItemActiveBackground() : 'transparent'
                                            }"
                                            @mouseover="$event.currentTarget.style.background=shortTurnItemHoverBackground()"
                                            @mouseout="$event.currentTarget.style.background = (Number(recordingState.parallelism) === Number(opt.value) ? shortTurnItemActiveBackground() : 'transparent')"
                                        >
                                            {{ opt.label }}
                                        </div>
                                    </div>
                                </div>
                </a-form-item>
              </div>
              <div>
                <a-form-item :label="t('console.recordingStepsPerSegment')" style="margin-bottom:0;">
                  <a-input-number v-model:value="recordingState.stepsPerSegment" :disabled="recordingState.isRecording" :min="1" :max="5000" style="width:100%" />
                </a-form-item>
              </div>
            </div>
            <div v-if="recordingState.parallelEnabled" style="margin-top:8px; font-size:12px; color:var(--muted);">
              {{ t('console.recordingParallelHint') }}
            </div>
          </div>

          <!-- Progress Bar闂傚倸鍊搁崐鎼佸磹閻戣姤鍊块柨鏃堟暜閸嬫挾绮☉妯诲櫧闁活厽鐟╅弻鐔告綇妤ｅ啯顎嶉梺绋款儏椤戝懘鍩為幋锔藉亹闁告瑥顦伴幃娆忊攽椤旀娼愰柣鎿勭節瀵濡搁妷銏℃杸闂佺硶鍓濋敃鈺佄涢埄鍐瘈婵炲牆鐏濋悘锟犳煙閸涘﹤鈻曠€殿喖顭烽幃銏ゆ偂鎼达絿鏆伴柣鐔哥矊缁绘﹢寮鍜佸悑闁搞儮鏅濋敍婊勭節閵忥絾纭鹃柨鏇樺劦瀹曟垿濡烽埡鍌滃幐闁诲繒鍋涙晶钘壝虹€涙﹩娈介柣鎰綑濞搭喗顨ラ悙杈捐€跨€规洘锕㈤獮鎾诲箲椤愵剙顩紒杈ㄦ崌瀹曟帒鈻庨幒鎴濆腐缂傚倷绶￠崳顕€宕归悽绋跨妞ゆ劧闄勯埛?+ 濠电姷鏁告慨鐑姐€傞挊澹╋綁宕ㄩ弶鎴狅紱闂佸憡渚楅崣搴ㄦ偄閸℃ü绻嗘い鏍ㄦ皑濮ｇ偤鏌涚€ｎ偅灏い顐ｇ箞閹剝鎯旈敐鍕敇濠碉紕鍋戦崐鎴﹀垂濞差亝鏅濋柕蹇嬪€楀畵渚€鏌″鍐ㄥ濠殿垱鎸抽弻娑樷攽閸曨偄濮跺┑鈩冨絻閻栫厧顫忕紒妯诲闁告縿鍎查悗顕€姊洪棃娑欘棏闁稿鎹囧铏圭矙濞嗘儳鍓遍梺鍦焾婢ц棄危閹版澘绠婚柟棰佺閹垿姊虹化鏇炲⒉妞ゃ劌鐗婄€电厧鐣濋崟顒€鈧灚绻涢崼婵堜虎婵炲懏锕㈤弻娑㈡晲韫囨洖鍩岄梺浼欑秮閺€杈╃紦閻ｅ瞼鐭欓柛顭戝枛缁侇噣姊绘担铏瑰笡婵炲弶鐗犲畷鎰節濮橆剝袝?+ 闂傚倸鍊峰ù鍥х暦閻㈢绐楅柟閭﹀枛閸ㄦ繈骞栧ǎ顒€鐏繛鍛У娣囧﹪濡堕崨顔兼缂備胶濮抽崡鎶藉蓟濞戞ǚ妲堟慨妤€鐗婇弫鎯р攽閻愬弶鍣藉┑鐐╁亾闂佸搫鐭夌徊鍊熺亽闂佺绻愰崥瀣掗崟顖涒拺?闂傚倸鍊搁崐椋庣矆娓氣偓楠炴牠顢曚綅閸ヮ剦鏁冮柨鏇楀亾闁汇倗鍋撶换婵囩節閸屾稑娅ч梺娲诲幗閻熲晠寮婚悢鍛婄秶闁告挆鍛闂備礁鎲℃穱娲綖婢舵劕桅闁告洦鍨扮粻濠氭偣閾忚纾柕澶嗘櫆閻撴洘淇婇妶鍕厡妞わ綀灏欑槐鎺旂磼濡吋鍒涢悗瑙勬礀瀹曨剝鐏掗梺鎯х箻閳ь剚绋掑Ο濠勭磽閸屾瑧鍔嶆い銊ユ瀹曞綊宕归鍛稁闂佹儳绻楅～澶屸偓姘哺閺屽秹濡烽妷銉︽瘣濡ょ姷鍋為崝妤冩閹惧瓨濯撮柣锝呰嫰閻楁岸姊虹粙鍖℃敾妞ゃ劌鎳庡畵?-->
          <div v-if="recordingState.isRecording" style="margin-bottom:12px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; flex-wrap:wrap; gap:8px;">
              <a-typography-text type="secondary">{{ t('console.recordingProgress') }}</a-typography-text>
              <a-typography-text>
                {{ Math.floor(recordingProgressPercent) }}%
                <span style="margin-left:8px;">
                  {{ t('console.recordingRemainingTimeHint') }} {{ recordingRemainingTimeText }}
                </span>
              </a-typography-text>
            </div>
            <a-progress
              :percent="Math.min(100, Math.max(0, Math.floor(recordingProgressPercent)))"
              :show-info="false"
              stroke-color="#E74C3C"
              :stroke-width="8"
            />
            <div v-if="recordingState.mode!=='parallel'" style="margin-top:6px; display:flex; justify-content:space-between; font-size:12px; color:var(--muted);">
              <span>
                {{ t('console.recordingCurrentStation') }}闂傚倸鍊搁崐鎼佸磹閻戣姤鍊块柨鏃堟暜閸嬫挾绮☉妯诲櫧闁活厽鐟╅弻鐔兼倻濮楀棙顓归梺杞扮濡稓妲?recordingCurrentStationName }}
              </span>
              <span>
                {{ recordingArrDepLabel }}
              </span>
            </div>
            <div v-if="recordingState.mode==='parallel' && recordingState.segmentSummary" style="margin-top:6px; font-size:12px; color:var(--muted); display:flex; justify-content:space-between;">
              <span>{{ t('console.recordingSegments') }}: {{ recordingState.segmentSummary.done }}/{{ recordingState.segmentSummary.total }}</span>
              <span v-if="parallelStageLabel">{{ t('console.recordingStage') }}: {{ parallelStageLabel }}</span>
            </div>
          </div>

          <!-- Control Buttons -->
          <a-row :gutter="[10,10]">
            <a-col :span="24" :sm="12">
              <a-button
                danger
                block
                size="large"
                :disabled="!currentRecordingDisplay"
                @click="toggleRecording"
              >
                <i :class="recordingState.isRecording ? 'fas fa-stop' : 'fas fa-video'" style="margin-right:6px;"></i>
                {{ recordingState.isRecording ? t('console.recordingStop') : t('console.recordingStart') }}
              </a-button>
            </a-col>
            <a-col :span="24" :sm="12">
              <a-button block size="large" @click="openRecordingFolder">
                <i class="fas fa-folder-open" style="margin-right:6px;"></i>{{ t('console.recordingOpenFolder') }}
              </a-button>
            </a-col>
          </a-row>
        </a-card>
        
      </div>
      </a-space>
    </div>
    
    <!-- 濠电姷鏁告慨鐑姐€傞挊澹╋綁宕ㄩ弶鎴狅紱闂佸憡渚楅崣搴ㄦ偄閸℃ü绻嗘い鏍ㄦ皑濮ｇ偤鏌涚€ｎ偅灏い顐ｇ箞閹剝鎯旈敐鍕敇濠碉紕鍋戦崐鎴﹀垂濞差亝鍋￠柍杞扮贰閸ゆ洟鏌熺紒銏犳灈妞ゎ偄鎳橀弻锝呂熼崗鍏兼瘎闂佸憡锕╅崜鐔奉潖缂佹ɑ濯寸紒娑橆儐缂嶅牓姊虹粙鍧楊€楅柛姘儔楠炲牓濡搁埡浣勓冾熆鐠虹尨鏀婚弶鍫濈墕閳规垿鎮欓弶鎴犱户闂佹悶鍔嶅浠嬪箖閿熺姵鍋愮紓浣诡焽閸樼數绱撴担鍓插剱閻庣瑳鍥х闁挎繂顦伴悡鐔搞亜閹捐泛鍓抽柛鏃傚枛閺?- 濠电姷鏁告慨鐑藉极閹间礁纾婚柣妯款嚙缁犲灚銇勮箛鎾搭棤缂佲偓婵犲洦鐓冪憸婊堝礈濮樿鲸宕叉繛鎴炵懃缁剁偤鎮楅敐搴′簽妞わ缚鍗抽幃?Teleport 濠电姷鏁告慨鐑藉极閹间礁纾婚柣鏂款浉婢舵劕绠涢柡澶庢硶閿涙盯姊鸿ぐ鎺戜喊闁告ê澧界划缁樸偅閸愨晝鍘撻悷婊勭矒瀹曟粓鎮㈤悡搴ゆ憰閻庡箍鍎遍悧婊冾瀶閵娾晜鈷戠紒瀣硶缁犺尙绱掔€ｎ偅灏甸柛鎺撳浮瀹曞ジ鎮㈤搹瑙勫殞闂備線鈧偛鑻晶顕€鏌?body闂傚倸鍊搁崐鎼佸磹閻戣姤鍊块柨鏃堟暜閸嬫挾绮☉妯诲櫧闁活厽鐟╅弻鐔告綇妤ｅ啯顎嶉梺鎼炲€栭崝鏍Φ閸曨垰鍐€妞ゆ劏鎳囬崑鎾斥槈閵忕姷鍊炲銈嗗坊閸嬫捇鏌﹂崘顏勬灈闁哄本娲樺鍕槈濮樿鲸娈稿┑鐐差嚟婵潧顪冮挊澶樻綎婵炲樊浜濋ˉ鍫熺箾濞ｎ剙鈧牠鎯勯姘辨殾闁靛ň鏅╅弫鍥煃閽樺顥滈柡浣搞偢濮婂宕掑顑藉亾閻戣姤鍤勯柛鎾茬閸ㄦ繃銇勯弽顐粶缂佲偓婢跺绻嗛柕鍫濇噺閸ｅ湱绱掗悩闈涒枅闁哄瞼鍠栭獮鍡氼槾闁伙綆鍘奸湁婵犲﹤鍟扮粔娲煛瀹€鈧崰鏍ь潖閼姐倐鍋撻悽娈跨劸濠碘€茬矙濮婅櫣绱掑Ο璇茶敿闂佺瀛╅悡鈩冧繆閻㈢绀嬫い鏍ㄧ椤ユ繈鏌ｉ悩鍏呰埅闁告柨顑夐幖瑙勬償閿濆洨锛濋梺绋挎湰濮樸劌鐡梻浣侯攰濞呮洟鏁冮姀鐙€鍤曢悹鍥ㄧゴ濡插牊淇婇娑氱煁婵﹤缍婇獮蹇涘川閺夋垶宓嶅銈嗘寙閸曟垯鍊曢埞鎴︽偐閸偅姣勯梺绋款儐閻╊垶骞冭缁绘繈宕惰閻庮參鎮峰鍛暭閻㈩垱甯炵划濠氭偄閸忚偐鍘电紓鍌欓檷閸ㄥ綊寮稿☉娆樻闁绘劦浜滈悘顏堟煙娓氬灝濡奸摶锝夋煕濠靛棗顏柛濠庡灣缁辨捇宕掑姣欍垻绱掓径濠勪粵缂佸矁椴哥换婵嬪炊閵娿儮鍋撴搴樺亾閻熸澘顥忛柛鐘崇墵瀹曟粍瀵肩€涙鍘介柟鍏肩暘閸ㄥ鍩㈤幘缁樼厸闁告侗鍨伴埢鍫燁殽?-->
    <Teleport to="body">
        <div 
            v-if="presetContextMenu.visible"
            class="station-context-menu station-context-menu--glass-shell"
            data-preset-context-menu
            v-glassmorphism="{ blur: 12, opacity: 0.2, color: '#ffffff' }"
            @click.stop
            @contextmenu.prevent
            :style="{
                position: 'fixed',
                left: presetContextMenu.x + 'px',
                top: presetContextMenu.y + 'px',
                zIndex: 9999
            }"
        >
            <!-- 闂傚倸鍊搁崐鎼佸磹妞嬪海鐭嗗〒姘ｅ亾妤犵偞鐗犻、鏇㈡晜閽樺缃曢梻浣虹《閸撴繈鎽傜€ｎ喖鐐婃い鎺嶇娴犺櫣绱撴担鍓插創婵炲娲熷畷婵嬫晝閳ь剟鈥旈崘顔嘉ч柛鈩冾殔濞兼垿姊虹粙娆惧剱闁圭顭锋俊鐢稿礋椤栨稒娅嗛柣鐘叉搐瀵爼鎮靛┑瀣拺缁绢厼鎳忛悵顏堟煟閻斿弶娅婇柣娑卞枤閳ь剨缍嗛崰妤呭磹婵犳碍鐓曢柕澶堝灪濞呭洭鏌ｉ幘鏉戠伌婵﹦绮幏鍛村川婵犲倹娈樻繝鐢靛仩椤曟粎绮婚幘宕囨殾闁瑰墎鐡旈弫瀣煃瑜滈崜娆撴偩閻戠瓔鏁嶆繛鎴炵懃閸斿懘姊洪棃娑辩叚濠碘€虫喘瀹曘垽骞栨担鍏夋嫼闂佸憡绋戦敃銈嗘叏閸岀偞鐓曢柡鍌濇硶閻掓悂鏌曢崱妤€鈧潡骞栬ぐ鎺濇晝闁靛牆娴傞崯搴ㄦ⒒娴ｇ顥忛柛瀣瀹曠増鎯旈妸锕€鈧爼鏌熺紒銏犳灍闁绘挻鐟х槐鎺戔槈濡槒纭€闂佸憡甯炴晶妤呭Φ閸曨垼鏁囨繝濠傚暙椤洭鎮楃憴鍕闁挎洏鍨烘穱濠傤潰瀹€濠冾€囨繝?-->
            <template v-if="presetContextMenu.preset">
                <div class="station-context-menu-item" @click="applyPresetFromMenu()">
                    <i class="fas fa-download"></i>
                    {{ t('console.presetLoad') }}
                </div>
                <div class="station-context-menu-divider"></div>
                <div class="station-context-menu-item" @click="renamePresetFromMenu()">
                    <i class="fas fa-pen"></i>
                    {{ t('lineManager.ctxRename') }}
                </div>
                <div class="station-context-menu-divider"></div>
                <div class="station-context-menu-item" @click="sharePresetOffline()">
                    <i class="fas fa-share-alt"></i>
                    {{ t('console.presetShare') }}
                </div>
                <div class="station-context-menu-divider"></div>
                <div class="station-context-menu-item" @click="importPresetFromShareCode()">
                    <i class="fas fa-file-import"></i>
                    {{ t('console.presetImport') }}
                </div>
                <div class="station-context-menu-divider"></div>
                <div class="station-context-menu-item danger" @click="deletePresetFromMenu()">
                    <i class="fas fa-trash"></i>
                    {{ t('console.presetDelete') }}
                </div>
            </template>
            <!-- 婵犵數濮烽弫鍛婃叏閻戣棄鏋侀柟闂寸绾剧粯绻涢幋鐐垫噧缂佸墎鍋ら弻娑㈠Ψ椤旂厧顫╃紓浣插亾闁割偆鍠撶弧鈧梻鍌氱墛缁嬫帡鏁嶉弮鍫熺厾闁哄娉曟禒銏ゆ婢舵劖鐓ユ繝闈涙婢跺嫭銇勮箛鏇炴灁缂佽鲸甯￠獮澶屸偓锝庡墰琚﹂梻浣告惈閺堫剟鎯勯姘煎殨闁圭虎鍠栨儫闂侀潧顧€婵″洩銇愰鐐粹拻濞达絽鎲￠幉鎼佹煕閻樻煡鍙勯柡灞斤躬閺佹劖寰勬繝鍛啺闂備浇娉曢崰鎾存叏鐎靛摜鐭嗛柛鎰ㄦ杺娴滄粓鏌熼悙顒夋當闁哥噥鍨伴埢宥咁吋閸モ晝锛濋梺绋挎湰閻燂妇绮婇弶娆炬富闁哄鍨堕幉鎼佹煙楠炲灝鐏茬€规洘锕㈤、鏃堝幢濞嗘垵濮介梻鍌欑濠€閬嶅磿閵堝鈧啴宕ㄩ褍鏅犲┑鐘绘涧濞层垺绂嶅鍫熺厸闁告劑鍔嶉幖鎰瑰鍐Ш闁哄本绋掔换婵嬪礃閵娧呮嚃缂傚倷鑳剁划顖炴儎椤栫偟宓佹俊顖氱毞閸嬫捇妫冨☉姗嗘闂佸搫妫寸槐鏇犳閹惧瓨濯撮柛鎾村絻閸撻亶姊洪崨濠冣拹妞ゃ劌锕ら悾宄邦潩鐠鸿櫣顔婂┑掳鍊撶粈浣圭瑜版帗鐓熼柣妯哄级缁屽潡鎮樿箛鏃傛噰閽樻繃銇勯幇鍫曟闁抽攱鍨圭槐鎺楊敍濞戞瑧顦ユ繝鈷€鍐ㄧ骇缂佺粯鐩幊鐘活敆閳ь剟寮稿☉銏＄厵妞ゆ洖妫涚弧鈧梺绯曟櫔缁绘繂鐣烽妸鈺婃晩闁诡垎鍐啈婵犵绱曢崑鎴﹀磹閺嶎灛娑欐媴閸濄儲娈鹃梺姹囧灪濞煎矂宕堕浣规珕婵犳鍠楅崝鎺旇姳婵犳碍鈷戦柛婵嗗缁佲晜绻濋埗鈺佷壕闂備浇顫夎ぐ鍐╂櫠娴犲鐒?-->
            <template v-else>
                <div class="station-context-menu-item" @click="importPresetFromShareCode()">
                    <i class="fas fa-file-import"></i>
                    {{ t('console.presetImport') }}
                </div>
            </template>
        </div>
    </Teleport>
    
    <!-- 闂傚倸鍊搁崐鎼佸磹閻戣姤鍤勯柛鎾茬閸ㄦ繃銇勯弽顐粶缂佲偓婢跺绻嗛柕鍫濇噺閸ｅ湱绱掗悩闈涒枅闁哄瞼鍠栭獮鎴﹀箛闂堟稒顔勯梻浣告啞娣囨椽锝炴径鎰﹂柛鏇ㄥ灠缁秹鏌涢妷顔惧帥婵☆偄瀚槐鎾存媴缁嬫鏆㈤梺绋款儍閸婃繂顕ｆ繝姘伋闁归绀侀幃鎴︽煙閼测晞藟闁逞屽墮绾绢參顢欓幇鐗堚拻濞达絽鎲￠崯鐐烘煛瀹€瀣М鐎规洘娲熼幃鐣岀矙閼愁垱鎲版繝鐢靛仦閸ㄥ墎鍒掓惔銊﹀仾闁逞屽墴濮婃椽宕崟顐熷亾閸濄儴濮抽梺顒€绉撮崙鐘崇箾閸℃绠氶柡鈧禒瀣厓闁芥ê顦伴ˉ婊兠瑰鍕煉闁哄矉绲鹃獮濠囨煕閺冣偓閸ㄥ灝顕ｉ銏╁悑濠㈣泛锕﹂悿鈧梻浣告惈椤﹀啿鈻旈弴鈶哄洭寮跺▎鐐瘜闂侀潧鐗嗗Λ娆戠矆閳ь剟姊洪悷鏉挎毐闂佸府绲介锝夊蓟閵夘喗鏅ｉ梺闈涚箚濡狙囧箯濞差亝鈷戦柛娑橈功閳藉鏌ㄩ弴顏嗙暤妤犵偛锕畷鐔碱敃閻斿憡鏉搁梻浣虹帛閸旀﹢顢氬鍫㈠彆妞ゆ帒鍊甸崑鎾斥枔閸喗鐝梺绋款儏閿曨亪濡存担鍓叉建闁逞屽墯閹便劑鍩€椤掑嫭鐓冮柕澶堝妽閻濐亝銇勯幘鏉戭嚋缂佺粯绻堥幃浠嬫濞磋翰鍨介弻銊╁即濡　鍋撳┑鍡欐殾妞ゆ牜鍎愰弫鍐煏閸繃宸濋柣鎺戙偢閺岋絾鎯旈婊呅ｉ梺鍝ュУ椤ㄥ﹪骞冮敓鐘冲亜闁稿繗鍋愰崢顏呯節閻㈤潧浠滈柣蹇旂箞瀹曟繂顫濋婊€绨婚棅顐㈡祫缁蹭粙鐛弽顓燁梿濠㈣埖鍔栭悡鐔兼煙閻愵剙鈻曟い搴㈩殕閵囧嫯绠涢敐鍛敖缂?- 濠电姷鏁告慨鐑藉极閹间礁纾婚柣妯款嚙缁犲灚銇勮箛鎾搭棤缂佲偓婵犲洦鐓冪憸婊堝礈濮樿鲸宕叉繛鎴炵懃缁剁偤鎮楅敐搴′簽妞わ缚鍗抽幃?Teleport 濠电姷鏁告慨鐑藉极閹间礁纾婚柣鏂款浉婢舵劕绠涢柡澶庢硶閿涙盯姊鸿ぐ鎺戜喊闁告ê澧界划缁樸偅閸愨晝鍘撻悷婊勭矒瀹曟粓鎮㈤悡搴ゆ憰閻庡箍鍎遍悧婊冾瀶閵娾晜鈷戠紒瀣硶缁犺尙绱掔€ｎ偅灏甸柛鎺撳浮瀹曞ジ鎮㈤搹瑙勫殞闂備線鈧偛鑻晶顕€鏌?body -->
    <Teleport to="body">
        <div 
            v-if="presetContextMenu.visible"
            @click="closePresetContextMenu"
            style="position: fixed; inset: 0; z-index: 9998; background: transparent;"
        ></div>
    </Teleport>
    
    <!-- Color Picker Dialog -->
    <ColorPicker 
      v-model="showColorPicker" 
      :initial-color="colorPickerInitialColor"
      @confirm="onColorConfirm"
    />
</template>
<script src="./ConsolePage.js"></script>
<style scoped>
.pids-route-label {
  display: block;
}

.pids-route-flow {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: 100%;
  margin-left: 6px;
  vertical-align: middle;
}

.pids-route-flow__name {
  min-width: 0;
}

.pids-route-flow__arrow {
  position: relative;
  width: 22px;
  height: 12px;
  flex: 0 0 22px;
  opacity: 0.92;
}

.pids-route-flow__arrow::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  width: 14px;
  height: 2px;
  background: currentColor;
  border-radius: 999px;
  transform: translateY(-50%);
}

.pids-route-flow__arrow::after {
  content: '';
  position: absolute;
  right: 0;
  top: 50%;
  width: 8px;
  height: 8px;
  border-top: 2px solid currentColor;
  border-right: 2px solid currentColor;
  transform: translateY(-50%) rotate(45deg);
  box-sizing: border-box;
}
</style>
