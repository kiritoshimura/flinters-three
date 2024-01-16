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
/** 生成する火 */
const FIRE_RADIUS_END = 0.6;
const FIRE_HEIGHT_END = 0.7;
const FIRE_PARTICLE_COUNT_END = 150;
const FIRE_POSITION = [0, 0, 10];
const FIRE_LIMIT_NUMBER = 1;
/** マウスカーソルについてくる生成する火 */
const FIRE_MOUSE_RADIUS = 0.2;
const FIRE_MOUSE_HEIGHT = 0.7;
const FIRE_MOUSE_PARTICLE_COUNT = 50;
const FIRE_MOUSE_POSITION = [0, 0, 10];
const FIRE_MOUSE_LIMIT_NUMBER = 1;
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
const CAMERA_POSITION = [0, 0, 30];

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

    answerArray.forEach((answer, index) => {
      const textGeometry = new TextGeometry(answer, {
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
        (index - answer.length) * 2,
        TEXT_POSITION[1],
        TEXT_POSITION[2],
      ];
      text.position.set(textPosition[0], textPosition[1], textPosition[2]);
      // text.rotation.x = (-90 * Math.PI) / 180;

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
    scene.background = new THREE.Color("black");

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

    // *** 開発用 ***
    // 軸とグリッドのヘルパー表示
    // const axes = new THREE.AxesHelper(20);
    // scene.add(axes);
    // const gridHelper = new THREE.GridHelper(10, 5);
    // scene.add(gridHelper);
    // マウスでぐりぐりできるようにするプラグイン。開発中は便利である
    // new OrbitControls(camera, renderer.domElement);

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
    renderer.setSize(sizes.width, sizes.height);
    renderer.setPixelRatio(window.devicePixelRatio);

    // 平面
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(100, 100, 1, 1),
      new THREE.MeshLambertMaterial({
        color: 0x000,
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
    const mouseFireMaterial = new particleFire.Material({ color: 0x600000 });
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
    mouseParticleFireMesh.rotation.x = (-90 * Math.PI) / 180;
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
      const initFireMaterial = new particleFire.Material({ color: 0x600000 });
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
    const clickApplyForce = new CANNON.Vec3();
    const clock = new THREE.Clock();
    let fireNumber = 0;
    let fireNumberMax = 20;
    const tick = () => {
      // fire
      const delta = clock.getDelta();
      mouseParticleFireMesh.material.update(delta);
      // initParticleFireMeshs.forEach((initParticleFireMesh, index) => {
      //   if (fireNumber < 0) {
      //     scene.remove(initParticleFireMesh);
      //     initParticleFireMesh.material.dispose();
      //     initParticleFireMesh.geometry.dispose();
      //     initParticleFireMeshs.splice(index, 1);
      //   } else {
      //     const fireGeometry = new particleFire.Geometry(
      //       FIRE_RADIUS + fireNumber / 100,
      //       FIRE_HEIGHT + fireNumber / 100,
      //       FIRE_PARTICLE_COUNT + fireNumber / 10
      //     ) as THREE.BufferGeometry;
      //     initParticleFireMesh.geometry.copy(fireGeometry);
      //     const position = new Float32Array(1 * 3);
      //     initParticleFireMesh.geometry.setAttribute(
      //       "position",
      //       new THREE.BufferAttribute(position, 3)
      //     );
      //     initParticleFireMesh.material.update(delta);
      //   }
      // });
      window.requestAnimationFrame(tick);

      // 力を加える
      texts!.forEach((text, index) => {
        // 風の力を適用
        if (fireNumber < 3) {
          textBodies[index].applyForce(
            clickApplyForce,
            textBodies[index].position
          );
        }
      });

      // 物理エンジンの計算 物理エンジンは毎秒60回更新されます
      world.step(1 / 60);

      // 物理エンジンでの位置と回転をThree.jsのオブジェクトに反映
      if (fireNumber < fireNumberMax) {
        fireNumber += 1;
      }
      particleFireMeshs.forEach((particleFireMesh, index) => {
        if (fireNumber >= fireNumberMax) {
          scene.remove(particleFireMesh);
          particleFireMesh.material.dispose();
          particleFireMesh.geometry.dispose();
          initParticleFireMeshs.splice(index, 1);
        } else {
          const fireGeometry = new particleFire.Geometry(
            FIRE_MOUSE_RADIUS +
              ((FIRE_RADIUS_END - FIRE_MOUSE_RADIUS) / fireNumberMax) *
                fireNumber,
            FIRE_MOUSE_HEIGHT +
              ((FIRE_HEIGHT_END - FIRE_MOUSE_HEIGHT) / fireNumberMax) *
                fireNumber,
            FIRE_MOUSE_PARTICLE_COUNT +
              ((FIRE_PARTICLE_COUNT_END - FIRE_MOUSE_PARTICLE_COUNT) /
                fireNumberMax) *
                fireNumber
          ) as THREE.BufferGeometry;
          particleFireMesh.geometry.copy(fireGeometry);
          particleFireMesh.material.update(delta);
        }
        // particleFireMesh.position.copy(
        //   particleFireBodies[index].position as any
        // );
        // particleFireMesh.quaternion.copy(
        //   particleFireBodies[index].quaternion as any
        // );
        // particleFireMesh.material.update(delta);
      });

      firePointLights.forEach((firePointLight, index) => {
        if (fireNumber >= fireNumberMax) {
          scene.remove(firePointLight);
          initParticleFireMeshs.splice(index, 1);
        } else {
          firePointLight.intensity = 100 + fireNumber * 10;
          firePointLight.distance = 10 + fireNumber;
        }
        // firePointLight.position.copy(particleFireBodies[index].position as any);
        // firePointLight.quaternion.copy(
        //   particleFireBodies[index].quaternion as any
        // );
      });

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
    });

    //マウスイベントを登録
    canvas.addEventListener("click", () => {
      fireNumber = 0;

      clickApplyForce.set(
        (mouseCursolDisp.x * mouseCursolDisp.widthOnOrigin) / 2,
        (mouseCursolDisp.y * mouseCursolDisp.heightOnOrigin) / 2,
        FIRE_POSITION[2]
      );

      // ** Mesh **
      // 火
      const clickGeometry = new particleFire.Geometry(
        FIRE_MOUSE_RADIUS,
        FIRE_MOUSE_HEIGHT,
        FIRE_MOUSE_PARTICLE_COUNT
      );
      const clickMaterial = new particleFire.Material({ color: 0x600000 });
      clickMaterial.setPerspective(camera.fov, height);
      const clickParticleFireMesh = new THREE.Points(
        clickGeometry,
        clickMaterial
      );
      clickParticleFireMesh.position.set(
        (mouseCursolDisp.x * mouseCursolDisp.widthOnOrigin) / 2,
        (mouseCursolDisp.y * mouseCursolDisp.heightOnOrigin) / 2,
        FIRE_POSITION[2]
      );
      clickParticleFireMesh.rotation.x = (-90 * Math.PI) / 180;
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
        (mouseCursolDisp.x * mouseCursolDisp.widthOnOrigin) / 2,
        (mouseCursolDisp.y * mouseCursolDisp.heightOnOrigin) / 2,
        FIRE_POSITION[2]
      );
      scene.add(clickPointLight);
      firePointLights.push(clickPointLight);
      // FIRE_LIMIT_NUMBER個以上の火がある場合は、一番古い火を削除する
      if (firePointLights.length > FIRE_LIMIT_NUMBER) {
        scene.remove(firePointLights[0]);
        firePointLights.splice(0, 1);
      }

      // -- 物理演算 --
      // 物理エンジンキューブ（火）
      // const clickParticleFireShape = new CANNON.Box(
      //   new CANNON.Vec3(FIRE_RADIUS / 2, FIRE_HEIGHT / 4, FIRE_RADIUS / 2)
      // );
      // const clickParticleFireBody = new CANNON.Body({
      //   mass: 1, // 質量
      //   position: new CANNON.Vec3(
      //     (mouseCursolDisp.x * mouseCursolDisp.widthOnOrigin) / 2,
      //     (mouseCursolDisp.y * mouseCursolDisp.heightOnOrigin) / 2,
      //     FIRE_POSITION[2]
      //   ), // 初期位置
      // });
      // clickParticleFireBody.addShape(clickParticleFireShape); // 形状を追加
      // world.addBody(clickParticleFireBody); // 世界に追加
      // particleFireBodies.push(clickParticleFireBody);
      // if (particleFireBodies.length > FIRE_LIMIT_NUMBER) {
      //   world.removeBody(particleFireBodies[0]);
      //   particleFireBodies.splice(0, 1);
      // }
    });

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
    <>
      <canvas id="canvas"></canvas>
    </>
  );
};
