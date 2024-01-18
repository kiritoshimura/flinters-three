import { useEffect, useState } from "react";
import * as THREE from "three";
import { FontLoader } from "three/examples/jsm/loaders/FontLoader.js";
import { TextGeometry } from "three/examples/jsm/geometries/TextGeometry.js";
import * as CANNON from "cannon-es";
// 型定義ファイルがないので、@ts-ignoreでエラーを無視する
/* @ts-ignore */
import particleFire from "three-particle-fire";

particleFire.install({ THREE: THREE });

type PropsType = {
  answer: string;
};

/** 生成するテキスト */
const TEXT_POSITION = [0, 1, 10]; // 0番目は上書きするので意味がない
const TEXT_INTERVAL_X = 2.5;
const TEXT_INTERECTAL_COLOR = 0x6666ff;
const TEXT_GRADAITION_COLOR = 0x0b0b00;
/** 火の色 */
const FIRE_COLOR = 0x000099;
/** 生成する火 */
const FIRE_RADIUS_END = 2;
const FIRE_HEIGHT_END = 3;
const FIRE_PARTICLE_COUNT_END = 250;
const FIRE_POSITION = [0, 0, 20];
const FIRE_LIMIT_NUMBER = 1;
/** マウスカーソルについてくる生成する火 */
const FIRE_MOUSE_RADIUS = 0.25;
const FIRE_MOUSE_HEIGHT = 2;
const FIRE_MOUSE_PARTICLE_COUNT = 300;
const FIRE_MOUSE_POSITION = [0, 0, 20];
/** 初期である火 */
const FIRE_INIT_RADIUS = 0.3;
const FIRE_INIT_HEIGHT = 1;
const FIRE_INIT_PARTICLE_COUNT = 100;
const FIRE_INIT_POSITION = [-5, 0, -5];
const FIRE_INIT_INTERVAL = 2;
const FIRE_INIT_LENGTH = 0;
const FIRE_INIT_POSITION_DIFF = 20;

/** カメラの視野角 */
const CAMERA_FOV = 35;
/** カメラの位置 */
const CAMERA_POSITION = [0, 0, 50];

/** 最初にでてきた数字を取り出す正規表現 */
const extractNumber = (str: string) => {
  const match = str.match(/^\d+/);
  return match ? parseInt(match[0], 10) : null;
};

export const THREEText = ({ answer }: PropsType) => {
  let canvas: HTMLElement;
  const [texts, setTexts] = useState<
    Array<THREE.Mesh<
      TextGeometry,
      THREE.MeshLambertMaterial,
      THREE.Object3DEventMap
    > | null>
  >([]);

  const [textBodies, setTextBodies] = useState<Array<CANNON.Body>>([]);

  /** クッリクした火のMesh */
  const particleFireMeshs: Array<THREE.Points<any, any>> = [];

  /** 火の光源 */
  const firePointLights: Array<THREE.PointLight> = [];

  /** 火の物理演算 */
  const particleFireBodies: Array<CANNON.Body> = [];

  /** レイキャストを生成 */
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  let textPointToPointConstraint: CANNON.PointToPointConstraint | null = null;
  let clickPosition = [0, 0, 0];
  let isClick = false;
  let isMouseDown = false;
  let isMouseUp = false;
  let intersectsTextColors = Array.from(
    { length: answer.length },
    () => 0xffffff
  );
  let mouseUpTickCount = 0;
  let mouseUpTickCountKeep = 0;
  let cameraZoomZCount = 0;

  const fontLoader = async () => {
    const answerArray = answer.split("");

    const _fontLoader = new FontLoader();
    const font = await _fontLoader.loadAsync("/fonts/Noto_Sans_Regular.json");

    const mapTexts: Array<THREE.Mesh<
      TextGeometry,
      THREE.MeshLambertMaterial,
      THREE.Object3DEventMap
    > | null> = [];

    const mapTextBodies: Array<CANNON.Body> = [];

    answerArray.forEach((asw, index) => {
      const textGeometry = new TextGeometry(asw, {
        font: font,
        size: 2,
        height: 1,
        curveSegments: 12,
        bevelEnabled: true,
        // 押し出し量
        bevelThickness: 0.01,
        bevelSize: 0.05,
        bevelOffset: 0,
        bevelSegments: 5,
      });
      textGeometry.center();

      const textMaterial = new THREE.MeshLambertMaterial({ color: "#ffffff" });
      const text = new THREE.Mesh(textGeometry, textMaterial);
      text.castShadow = true;
      const textPosition = [
        (index - asw.length - TEXT_INTERVAL_X) * 2,
        TEXT_POSITION[1],
        TEXT_POSITION[2],
      ];
      text.position.set(textPosition[0], textPosition[1], textPosition[2]);
      // text.rotation.x = (-90 * Math.PI) / 180;
      text.name = `${index}-text`;
      mapTexts.push(text);

      // 物理エンジンキューブ（文字）
      const textShape = new CANNON.Box(new CANNON.Vec3(0.75, 1, 0.5));
      const textBody = new CANNON.Body({
        mass: 1, // 質量
        position: new CANNON.Vec3(
          textPosition[0],
          textPosition[1],
          textPosition[2]
        ),
      });
      // textBody.quaternion.setFromEuler((-90 * Math.PI) / 180, 0, 0);
      textBody.addShape(textShape); // 形状を追加
      mapTextBodies.push(textBody);
    });

    setTexts(mapTexts);
    setTextBodies(mapTextBodies);
  };

  useEffect(() => {
    fontLoader();
  }, []);

  useEffect(() => {
    if (!texts) return;
    // canvasを取得
    canvas = document.getElementById("canvas")!;
    // シーン
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);

    // -- 物理演算 --
    //Worldオブジェクトを作成して、物理世界を初期化
    const world = new CANNON.World();
    //(最適化)衝突判定のためのBroadphaseアルゴリズムを設定
    world.broadphase = new CANNON.SAPBroadphase(world);
    //(最適化)オブジェクトが動かない場合に物理計算を省略（スリープ状態にする）ことを許可
    world.allowSleep = true;
    //重力の方向と大きさを設定します。通常、地球上の重力加速度
    world.gravity.set(0, -9.82, 0);
    // マウスに追従してくる火の位置
    let mouseCursolDisp = {
      x: 0,
      y: 0,
      z: 0,
      heightOnOrigin: 0,
      widthOnOrigin: 0,
    };

    // ** Mesh **
    // 文字の追加
    texts!.forEach((text) => {
      scene.add(text!);
    });

    // -- 物理演算 --
    // 文字の追加
    textBodies!.forEach((textBody) => {
      world.addBody(textBody); // 世界に追加
    });

    // サイズ
    const sizes = {
      width: innerWidth,
      height: innerHeight,
    };
    // カメラ
    const camera = new THREE.PerspectiveCamera(
      CAMERA_FOV,
      sizes.width / sizes.height,
      0.5,
      1000
    );

    camera.position.set(
      CAMERA_POSITION[0],
      CAMERA_POSITION[1],
      CAMERA_POSITION[2]
    );

    // 原点を見る
    camera.lookAt(scene.position);
    // レンダラー
    const renderer = new THREE.WebGLRenderer({
      canvas: canvas || undefined,
      antialias: true,
      alpha: true,
    });
    renderer.setSize(sizes.width - 1, sizes.height - 8);
    renderer.setPixelRatio(window.devicePixelRatio);

    // 平面
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(100, 100, 1, 1),
      new THREE.MeshLambertMaterial({
        color: 0x000000,
      })
    );
    plane.rotation.x += (-90 * Math.PI) / 180;
    scene.add(plane);

    // -- 物理演算 --
    //物理エンジン床
    const groundShape = new CANNON.Plane(); // Plane形状は無限に広がる平面です
    const groundBody = new CANNON.Body({
      mass: 0, // 質量0は動かないオブジェクトを意味します
    });
    groundBody.addShape(groundShape);
    // 床を水平にする
    groundBody.quaternion.setFromAxisAngle(
      new CANNON.Vec3(1, 0, 0),
      -Math.PI / 2
    );
    world.addBody(groundBody); // 世界に追加

    // ** Mesh **
    // マウスカーソルに追従する火
    const height = window.innerHeight;
    const mouseFireGeometry = new particleFire.Geometry(
      FIRE_MOUSE_RADIUS,
      FIRE_MOUSE_HEIGHT,
      FIRE_MOUSE_PARTICLE_COUNT
    ) as THREE.BufferGeometry;
    const mouseFireMaterial = new particleFire.Material({ color: FIRE_COLOR });
    mouseFireMaterial.setPerspective(camera.fov, height);
    const mouseParticleFireMesh = new THREE.Points(
      mouseFireGeometry,
      mouseFireMaterial
    );
    mouseParticleFireMesh.position.set(
      FIRE_MOUSE_POSITION[0],
      FIRE_MOUSE_POSITION[1],
      FIRE_MOUSE_POSITION[2]
    );

    scene.add(mouseParticleFireMesh);

    // ** Mesh **
    // 点光源
    const mouseFirePointLight = new THREE.PointLight(0xffffff, 100, 10, 1.0);
    mouseFirePointLight.position.set(
      FIRE_MOUSE_POSITION[0],
      FIRE_MOUSE_POSITION[1],
      FIRE_MOUSE_POSITION[2]
    );
    scene.add(mouseFirePointLight);

    const light = new THREE.AmbientLight(0xffffff, 0.3);
    scene.add(light);

    // 物理エンジンキューブ（クリックした時にでてくるやつ）
    const clickUpShape = new CANNON.Sphere(0.1);
    const clickUpBody = new CANNON.Body({
      mass: 0, // 質量
      position: new CANNON.Vec3(0, 0, 100), // 届かない範囲に配置
    });
    clickUpBody.addShape(clickUpShape);
    world.addBody(clickUpBody); // 世界に追加

    // ** Mesh **
    // 初期位置にある火
    const initParticleFireMeshs: Array<
      THREE.Points<THREE.BufferGeometry, any>
    > = Array.from({ length: FIRE_INIT_LENGTH }, (_, index) => {
      const initFireGeometry = new particleFire.Geometry(
        FIRE_INIT_RADIUS,
        FIRE_INIT_HEIGHT,
        FIRE_INIT_PARTICLE_COUNT
      ) as THREE.BufferGeometry;
      const initFireMaterial = new particleFire.Material({ color: FIRE_COLOR });
      initFireMaterial.setPerspective(camera.fov, height);
      const initParticleFireMesh = new THREE.Points(
        initFireGeometry,
        initFireMaterial
      );
      initParticleFireMesh.position.set(
        index >= FIRE_INIT_LENGTH / 2
          ? FIRE_INIT_POSITION[0] + FIRE_INIT_POSITION_DIFF
          : FIRE_INIT_POSITION[0],
        FIRE_INIT_POSITION[1],
        index >= FIRE_INIT_LENGTH / 2
          ? (index - FIRE_INIT_LENGTH / 2) * FIRE_INIT_INTERVAL +
              FIRE_INIT_POSITION[2]
          : index * FIRE_INIT_INTERVAL + FIRE_INIT_POSITION[2]
      );
      scene.add(initParticleFireMesh);
      // ** Mesh **
      // 点光源
      const initPointLight = new THREE.PointLight(0xffffff, 50, 10, 1.0);
      initPointLight.position.set(
        index >= FIRE_INIT_LENGTH / 2
          ? FIRE_INIT_POSITION[0] + FIRE_INIT_POSITION_DIFF
          : FIRE_INIT_POSITION[0],
        FIRE_INIT_POSITION[1],
        index >= FIRE_INIT_LENGTH / 2
          ? (index - FIRE_INIT_LENGTH / 2) * FIRE_INIT_INTERVAL +
              FIRE_INIT_POSITION[2]
          : index * FIRE_INIT_INTERVAL + FIRE_INIT_POSITION[2]
      );
      scene.add(initPointLight);

      return initParticleFireMesh;
    });

    // アニメーション
    const clock = new THREE.Clock();
    let fireNumber = 0;
    let fireNumberMax = 10;
    const tick = () => {
      // fire
      const delta = clock.getDelta();

      camera.position.set(
        CAMERA_POSITION[0],
        CAMERA_POSITION[1],
        CAMERA_POSITION[2] - mouseUpTickCount / 10
      );

      window.requestAnimationFrame(tick);

      if (textPointToPointConstraint !== null) {
        world.removeConstraint(textPointToPointConstraint);
        textPointToPointConstraint = null;
      }

      // mousedownの場合火を広げる
      if (isMouseDown && mouseUpTickCount < 30) {
        mouseUpTickCount += 1;
        mouseUpTickCountKeep += 1;
        const fireGeometry = new particleFire.Geometry(
          FIRE_MOUSE_RADIUS * (1 + mouseUpTickCount / 20),
          FIRE_MOUSE_HEIGHT * (1 + mouseUpTickCount / 20),
          FIRE_MOUSE_PARTICLE_COUNT * (1 + mouseUpTickCount / 4)
        ) as THREE.BufferGeometry;
        mouseParticleFireMesh.geometry.copy(fireGeometry);
      } else if (isMouseUp) {
        if (mouseUpTickCount > 0) {
          mouseUpTickCount < 6
            ? (mouseUpTickCount = 0)
            : (mouseUpTickCount -= 6);
          const fireGeometry = new particleFire.Geometry(
            FIRE_MOUSE_RADIUS * (1 + mouseUpTickCount / 20),
            FIRE_MOUSE_HEIGHT * (1 + mouseUpTickCount / 20),
            FIRE_MOUSE_PARTICLE_COUNT * (1 + mouseUpTickCount / 4)
          ) as THREE.BufferGeometry;
          mouseParticleFireMesh.geometry.copy(fireGeometry);
        }

        particleFireMeshs.forEach((particleFireMesh, index) => {
          if (fireNumber >= fireNumberMax) {
            scene.remove(particleFireMesh);
            particleFireMesh.material.dispose();
            particleFireMesh.geometry.dispose();
            initParticleFireMeshs.splice(index, 1);
          } else {
            const fireGeometry = new particleFire.Geometry(
              Math.round(
                (FIRE_MOUSE_RADIUS +
                  ((FIRE_RADIUS_END - FIRE_MOUSE_RADIUS) / fireNumberMax) *
                    fireNumber) *
                  (mouseUpTickCountKeep / 5) *
                  100
              ) / 100,
              Math.round(
                (FIRE_MOUSE_HEIGHT +
                  ((FIRE_HEIGHT_END - FIRE_MOUSE_HEIGHT) / fireNumberMax) *
                    fireNumber) *
                  (mouseUpTickCountKeep / 5) *
                  100
              ) / 100,
              Math.round(
                (FIRE_MOUSE_PARTICLE_COUNT +
                  ((FIRE_PARTICLE_COUNT_END - FIRE_MOUSE_PARTICLE_COUNT) /
                    fireNumberMax) *
                    fireNumber) *
                  (mouseUpTickCountKeep / 2) *
                  100
              ) / 100
            ) as THREE.BufferGeometry;
            particleFireMesh.geometry.copy(fireGeometry);
            particleFireMesh.material.update(delta);
          }
        });

        firePointLights.forEach((firePointLight, index) => {
          if (fireNumber >= fireNumberMax) {
            scene.remove(firePointLight);
            initParticleFireMeshs.splice(index, 1);
          } else {
            firePointLight.intensity =
              Math.round(
                (100 + fireNumber * 2) * (mouseUpTickCountKeep / 5) * 100
              ) / 100;
            firePointLight.distance =
              Math.round(
                (10 + fireNumber / 10) * (mouseUpTickCountKeep / 5) * 100
              ) / 100;
          }
        });
        if (fireNumber < fireNumberMax) {
          fireNumber += 1;
        } else {
          fireNumber = 0;
          mouseUpTickCountKeep = 0;
        }
      }
      mouseParticleFireMesh.material.update(delta);

      //マウス位置からまっすぐに伸びる光線ベクトルを生成
      raycaster.setFromCamera(mouse, camera);

      //光線と交差したオブジェクトを取得
      const intersects = raycaster.intersectObjects(scene.children, false);
      //光線と交差したオブジェクト2個以上がある場合（1個は常に火があるので）
      if (intersects.length > 1) {
        //交差したオブジェクトを取得
        const objs = intersects.map((intersect) => intersect.object);
        const textObj = objs.find((obj) => obj.name.includes("text"));
        //光線が文字と交差していた場合
        if (textObj) {
          const textIndex = extractNumber(textObj.name);
          if (textIndex !== null) {
            texts!.forEach((text, index) => {
              if (textIndex !== index) {
                if (intersectsTextColors[index] < 0xffffff)
                  intersectsTextColors[index] += TEXT_GRADAITION_COLOR;
                text!.material.color.setHex(intersectsTextColors[index]);
              } else {
                if (intersectsTextColors[index] >= TEXT_INTERECTAL_COLOR)
                  intersectsTextColors[index] -= TEXT_GRADAITION_COLOR;
                text!.material.color.setHex(intersectsTextColors[index]);
              }
            });

            if (isClick) {
              clickUpBody.position.set(
                textBodies[textIndex].position.x,
                textBodies[textIndex].position.y +
                  5 * Math.round(mouseUpTickCountKeep / 4),
                textBodies[textIndex].position.z
              );

              const textPivotA = new CANNON.Vec3(
                textBodies[textIndex].position.x,
                textBodies[textIndex].position.y,
                textBodies[textIndex].position.z
              );
              const textPivotB = new CANNON.Vec3(
                textBodies[textIndex].position.x,
                textBodies[textIndex].position.y +
                  2.5 * Math.round(mouseUpTickCountKeep / 4),
                textBodies[textIndex].position.z
              );
              textPointToPointConstraint = new CANNON.PointToPointConstraint(
                textBodies[textIndex],
                textPivotA,
                clickUpBody,
                textPivotB
              );
              world.addConstraint(textPointToPointConstraint);
            }
          }
        } else {
          texts!.forEach((text, index) => {
            if (intersectsTextColors[index] < 0xffffff)
              intersectsTextColors[index] += TEXT_GRADAITION_COLOR;
            text!.material.color.setHex(intersectsTextColors[index]);
          });
        }
      }
      isClick = false;

      // 物理エンジンの計算 物理エンジンは毎秒60回更新されます
      world.step(1 / 60);

      texts!.forEach((text, index) => {
        text!.position.copy(textBodies[index].position as any);
        text!.quaternion.copy(textBodies[index].quaternion as any);
      });

      renderer.render(scene, camera);
    };
    tick();

    //マウスイベントを登録
    canvas.addEventListener("mousemove", (event) => {
      const aspRatio = sizes.width / sizes.height;
      // 3D空間の高さと幅
      const heightOnOrigin =
        Math.tan((CAMERA_FOV * Math.PI) / 180 / 2) *
        (CAMERA_POSITION[2] - FIRE_POSITION[2]) *
        2;
      const widthOnOrigin = heightOnOrigin * aspRatio;

      mouseCursolDisp = {
        x: (event.clientX / sizes.width) * 2 - 1,
        y: -(event.clientY / sizes.height) * 2 + 1,
        z: 0,
        heightOnOrigin,
        widthOnOrigin,
      };

      mouseFirePointLight.position.set(
        (mouseCursolDisp.x * widthOnOrigin) / 2,
        (mouseCursolDisp.y * heightOnOrigin) / 2,
        FIRE_POSITION[2]
      );

      mouseParticleFireMesh.position.set(
        (mouseCursolDisp.x * widthOnOrigin) / 2,
        (mouseCursolDisp.y * heightOnOrigin) / 2,
        FIRE_POSITION[2]
      );

      mouse.x = mouseCursolDisp.x;
      mouse.y = mouseCursolDisp.y;
    });

    const onMouseDown = () => {
      isMouseUp = false;
      isMouseDown = true;
    };

    const onMouseUp = () => {
      isMouseDown = false;
      isMouseUp = true;
      // ここで、経過時間に応じたアクションを行う
      // 例: durationに応じた何かの処理
      isClick = true;
      fireNumber = 0;
      clickPosition = [
        (mouseCursolDisp.x * mouseCursolDisp.widthOnOrigin) / 2,
        (mouseCursolDisp.y * mouseCursolDisp.heightOnOrigin) / 2,
        FIRE_POSITION[2],
      ];

      // ** Mesh **
      // 火
      const clickGeometry = new particleFire.Geometry(
        FIRE_MOUSE_RADIUS,
        FIRE_MOUSE_HEIGHT,
        FIRE_MOUSE_PARTICLE_COUNT
      );
      const clickMaterial = new particleFire.Material({ color: FIRE_COLOR });
      clickMaterial.setPerspective(camera.fov, height);
      const clickParticleFireMesh = new THREE.Points(
        clickGeometry,
        clickMaterial
      );
      clickParticleFireMesh.position.set(
        clickPosition[0],
        clickPosition[1],
        clickPosition[2]
      );
      // clickParticleFireMesh.rotation.x = (-90 * Math.PI) / 180;
      scene.add(clickParticleFireMesh);
      particleFireMeshs.push(clickParticleFireMesh);
      // FIRE_LIMIT_NUMBER個以上の火がある場合は、一番古い火を削除する
      if (particleFireMeshs.length > FIRE_LIMIT_NUMBER) {
        scene.remove(particleFireMeshs[0]);
        particleFireMeshs[0].material.dispose();
        particleFireMeshs[0].geometry.dispose();
        particleFireMeshs.splice(0, 1);
      }

      // ** Mesh **
      // 点光源
      const clickPointLight = new THREE.PointLight(0xffffff, 100, 10, 1.0);
      clickPointLight.position.set(
        clickPosition[0],
        clickPosition[1],
        clickPosition[2]
      );
      scene.add(clickPointLight);
      firePointLights.push(clickPointLight);
      // FIRE_LIMIT_NUMBER個以上の火がある場合は、一番古い火を削除する
      if (firePointLights.length > FIRE_LIMIT_NUMBER) {
        scene.remove(firePointLights[0]);
        firePointLights.splice(0, 1);
      }
    };

    // イベントリスナーを追加
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mouseup", onMouseUp);

    // ブラウザのリサイズ処理
    window.addEventListener("resize", () => {
      sizes.width = window.innerWidth;
      sizes.height = window.innerHeight;
      camera.aspect = sizes.width / sizes.height;
      camera.updateProjectionMatrix();
      renderer.setSize(sizes.width, sizes.height);
      renderer.setPixelRatio(window.devicePixelRatio);
      // fire
      mouseParticleFireMesh.material.setPerspective(camera.fov, height);
    });
  }, [texts]);
  return (
    <div style={{ overflow: "hidden" }}>
      <canvas id="canvas"></canvas>
    </div>
  );
};
